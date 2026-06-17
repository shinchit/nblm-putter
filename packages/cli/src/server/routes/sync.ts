import { Router, Request, Response, IRouter } from 'express'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchHeadlessBrowser, createHeadlessContext } from '../../playwright/browser'
import { isSessionValid, openNotebookPage, uploadFileOnPage, UploadPhase } from '../../playwright/notebooklm'
import { loadIgnorePatterns } from '../../storage/index'
import { filterFiles } from '../../ignore/filter'
import { createJob, updateJob, isCancelled, JobLog, Job } from '../../db/jobs'
import { saveSession } from '../../storage/index'
import { walkDir } from '../../utils/files'

export const syncRouter: IRouter = Router()

syncRouter.post('/', async (req: Request, res: Response) => {
  const { folder, notebookId } = req.body as { folder: string; notebookId: string }
  if (!folder || !notebookId) {
    res.status(400).json({ error: 'folder and notebookId required' })
    return
  }

  const absFolder = resolve(folder)
  if (!existsSync(absFolder)) {
    res.status(400).json({ error: `Folder not found: ${folder}` })
    return
  }

  const ignorePatterns = await loadIgnorePatterns()
  const files = filterFiles(walkDir(absFolder), absFolder, ignorePatterns)
  const jobId = createJob({ notebookId, totalFiles: files.length })
  res.json({ jobId })

  setImmediate(async () => {
    const browser = await launchHeadlessBrowser()
    try {
      const ctx = await createHeadlessContext(browser)

      if (!await isSessionValid(ctx)) {
        updateJob(jobId, { status: 'failed' })
        return
      }
      updateJob(jobId, { status: 'running' })

      const errors: Array<{ file: string; reason: string }> = []
      const logs: JobLog[] = []
      let done = 0

      const page = await openNotebookPage(ctx, notebookId)
      // Re-save session after navigation — refreshes Google cookies and extends validity.
      ctx.storageState().then(state => saveSession(state)).catch(() => {})

      try {
        for (const file of files) {
          if (isCancelled(jobId)) {
            updateJob(jobId, { status: 'cancelled' as Job['status'], currentFile: null })
            break
          }
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
            file: name,
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
        await ctx.close().catch(() => {})
      }

      updateJob(jobId, { status: errors.length === files.length ? 'failed' : 'done' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[sync job ${jobId}] failed:`, message)
      updateJob(jobId, { status: 'failed' })
    } finally {
      await browser.close().catch(() => {})
    }
  })
})
