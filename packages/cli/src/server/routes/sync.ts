import { Router, Request, Response, IRouter } from 'express'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { BrowserContext } from 'playwright'
import { launchHeadlessBrowser, createHeadlessContext } from '../../playwright/browser'
import { isSessionValid, openNotebookPage, uploadFileOnPage, UploadPhase } from '../../playwright/notebooklm'
import { loadIgnorePatterns } from '../../storage/index'
import { filterFiles } from '../../ignore/filter'
import { createJob, updateJob, JobLog } from '../../db/jobs'
import { walkDir } from '../../utils/files'

export const syncRouter: IRouter = Router()

syncRouter.post('/', async (req: Request, res: Response) => {
  const { folder, notebookId, concurrency: rawConcurrency } = req.body as {
    folder: string
    notebookId: string
    concurrency?: number
  }
  if (!folder || !notebookId) {
    res.status(400).json({ error: 'folder and notebookId required' })
    return
  }

  const absFolder = resolve(folder)
  if (!existsSync(absFolder)) {
    res.status(400).json({ error: `Folder not found: ${folder}` })
    return
  }

  const concurrency = Math.max(1, Math.min(10, Number(rawConcurrency) || 1))
  const ignorePatterns = await loadIgnorePatterns()
  const files = filterFiles(walkDir(absFolder), absFolder, ignorePatterns)
  const jobId = createJob({ notebookId, totalFiles: files.length })
  res.json({ jobId })

  setImmediate(async () => {
    const browser = await launchHeadlessBrowser()
    const contexts: BrowserContext[] = []
    try {
      const firstCtx = await createHeadlessContext(browser)
      contexts.push(firstCtx)

      if (!await isSessionValid(firstCtx)) {
        updateJob(jobId, { status: 'failed' })
        return
      }
      updateJob(jobId, { status: 'running' })

      const workerCount = Math.min(concurrency, files.length)
      for (let i = 1; i < workerCount; i++) {
        contexts.push(await createHeadlessContext(browser))
      }

      const errors: Array<{ file: string; reason: string }> = []
      const logs: JobLog[] = []
      let done = 0
      const queue = [...files]

      async function runWorker(ctx: BrowserContext): Promise<void> {
        const firstFile = queue.shift()
        if (!firstFile) return

        const page = await openNotebookPage(ctx, notebookId)
        try {
          for (let file: string | undefined = firstFile; file; file = queue.shift()) {
            const name = file.split('/').pop() ?? file
            updateJob(jobId, { currentFile: `${name} — 準備中...` })
            const result = await uploadFileOnPage(page, file, (p: UploadPhase) => {
              if (p.phase === 'waiting-button') {
                updateJob(jobId, { currentFile: `${name} — ボタン有効化を待機中...` })
              } else if (p.phase === 'uploading') {
                const waited = p.buttonWaitMs ? ` (ボタン待ち ${(p.buttonWaitMs / 1000).toFixed(1)}s)` : ''
                updateJob(jobId, { currentFile: `${name} — アップロード中${waited}` })
              }
            })
            done++
            const log: JobLog = {
              file: file.split('/').pop() ?? file,
              success: result.success,
              reason: result.reason,
              at: new Date().toISOString(),
            }
            logs.push(log)
            if (!result.success) errors.push({ file: result.file, reason: result.reason ?? 'unknown' })
            updateJob(jobId, { doneFiles: done, currentFile: null, errors, logs })
          }
        } finally {
          await page.close()
        }
      }

      await Promise.all(contexts.map(ctx => runWorker(ctx)))
      updateJob(jobId, { status: errors.length === files.length ? 'failed' : 'done' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[sync job ${jobId}] failed:`, message)
      updateJob(jobId, { status: 'failed' })
    } finally {
      await Promise.all(contexts.map(ctx => ctx.close().catch(() => {})))
      await browser.close().catch(() => {})
    }
  })
})
