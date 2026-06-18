import { Router, Request, Response, IRouter } from 'express'
import { existsSync } from 'fs'
import { resolve, basename } from 'path'
import { createJob, updateJob, isCancelled, Job, JobLog } from '../../db/jobs'
import { loadIgnorePatterns, saveSession } from '../../storage/index'
import { filterFiles } from '../../ignore/filter'
import { walkDir } from '../../utils/files'
import { getOrCreateFolder, uploadFile } from '../../drive/client'
import { launchHeadlessBrowser, createHeadlessContext } from '../../playwright/browser'
import { openNotebookPage } from '../../playwright/notebooklm'
import { addSourcesFromDrive } from '../../playwright/drive-picker'

export const driveSyncRouter: IRouter = Router()

driveSyncRouter.post('/', async (req: Request, res: Response) => {
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
      updateJob(jobId, { status: 'running' })

      // Phase 1: Upload files to Drive
      let notebookFolderId: string
      try {
        const rootId = await getOrCreateFolder(null, 'nblm-putter')
        notebookFolderId = await getOrCreateFolder(rootId, notebookId)
      } catch (err) {
        console.error(`[drive-sync ${jobId}] Drive folder setup failed:`, err instanceof Error ? err.message : err)
        updateJob(jobId, { status: 'failed' })
        await browser.close().catch(() => {})
        return
      }

      const logs: JobLog[] = []
      const errors: Array<{ file: string; reason: string }> = []
      let done = 0

      for (const file of files) {
        if (isCancelled(jobId)) {
          updateJob(jobId, { status: 'cancelled' as Job['status'], currentFile: null })
          await browser.close().catch(() => {})
          return
        }
        const name = basename(file)
        updateJob(jobId, { currentFile: `[Drive] ${name} をアップロード中...` })
        try {
          await uploadFile(file, notebookFolderId)
          done++
          logs.push({ file: name, success: true, at: new Date().toISOString() })
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          errors.push({ file, reason })
          logs.push({ file: name, success: false, reason, at: new Date().toISOString() })
          done++
        }
        updateJob(jobId, { doneFiles: done, errors, logs })
      }

      // Phase 2: Add to NotebookLM via Drive picker
      updateJob(jobId, { currentFile: 'NotebookLM に追加中...' })
      try {
        const page = await openNotebookPage(ctx, notebookId)
        ctx.storageState().then(state => saveSession(state)).catch(() => {})
        await addSourcesFromDrive(page, notebookId)
        await page.close()
      } catch (err) {
        console.error(`[drive-sync ${jobId}] Drive picker failed:`, err instanceof Error ? err.message : err)
        updateJob(jobId, { status: 'failed', currentFile: null })
        await ctx.close().catch(() => {})
        await browser.close().catch(() => {})
        return
      }

      await ctx.close().catch(() => {})
      updateJob(jobId, { status: errors.length === files.length ? 'failed' : 'done', currentFile: null })
    } catch (err) {
      console.error(`[drive-sync ${jobId}] failed:`, err instanceof Error ? err.message : err)
      updateJob(jobId, { status: 'failed', currentFile: null })
    } finally {
      await browser.close().catch(() => {})
    }
  })
})
