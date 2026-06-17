import { Router, Request, Response, IRouter } from 'express'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchHeadless, closeBrowser } from '../../playwright/browser'
import { isSessionValid, registerFile } from '../../playwright/notebooklm'
import { loadIgnorePatterns } from '../../storage/index'
import { filterFiles } from '../../ignore/filter'
import { createJob, updateJob } from '../../db/jobs'
import { walkDir } from '../../utils/files'

export const syncRouter: IRouter = Router()

syncRouter.post('/', async (req: Request, res: Response) => {
  const { folder, notebookId } = req.body as { folder: string; notebookId: string }
  if (!folder || !notebookId) {
    res.status(400).json({ error: 'folder and notebookId required' })
    return
  }

  const absFolder = resolve(folder)

  // Validate folder exists
  if (!existsSync(absFolder)) {
    res.status(400).json({ error: `Folder not found: ${folder}` })
    return
  }

  // Calculate files before creating the job so totalFiles is accurate
  const ignorePatterns = await loadIgnorePatterns()
  const files = filterFiles(walkDir(absFolder), absFolder, ignorePatterns)

  const jobId = createJob({ notebookId, totalFiles: files.length })
  res.json({ jobId })

  setImmediate(async () => {
    let handle
    try {
      handle = await launchHeadless()
      if (!await isSessionValid(handle.context)) {
        updateJob(jobId, { status: 'failed' })
        return
      }
      updateJob(jobId, { status: 'running' })

      const errors: Array<{ file: string; reason: string }> = []
      let done = 0
      for (const file of files) {
        const result = await registerFile(handle.context, notebookId, file)
        done++
        if (!result.success) errors.push({ file: result.file, reason: result.reason ?? 'unknown' })
        updateJob(jobId, { doneFiles: done, errors })
      }
      updateJob(jobId, { status: 'done' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[sync job ${jobId}] failed:`, message)
      updateJob(jobId, { status: 'failed' })
    } finally {
      if (handle) await closeBrowser(handle)
    }
  })
})
