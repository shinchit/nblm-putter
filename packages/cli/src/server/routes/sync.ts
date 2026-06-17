import { Router, Request, Response, IRouter } from 'express'
import { readdirSync } from 'fs'
import { join, resolve } from 'path'
import { launchHeadless, closeBrowser } from '../../playwright/browser'
import { isSessionValid, registerFile } from '../../playwright/notebooklm'
import { loadIgnorePatterns } from '../../storage/index'
import { filterFiles } from '../../ignore/filter'
import { createJob, updateJob } from '../../db/jobs'

function walkDir(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkDir(fullPath))
    else results.push(fullPath)
  }
  return results
}

export const syncRouter: IRouter = Router()

syncRouter.post('/', async (req: Request, res: Response) => {
  const { folder, notebookId } = req.body as { folder: string; notebookId: string }
  if (!folder || !notebookId) {
    res.status(400).json({ error: 'folder and notebookId required' })
    return
  }

  const absFolder = resolve(folder)
  const jobId = createJob({ notebookId, totalFiles: 0 })
  res.json({ jobId })

  setImmediate(async () => {
    const handle = await launchHeadless()
    try {
      if (!await isSessionValid(handle.context)) {
        updateJob(jobId, { status: 'failed' })
        return
      }
      const ignorePatterns = await loadIgnorePatterns()
      const files = filterFiles(walkDir(absFolder), absFolder, ignorePatterns)
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
    } catch {
      updateJob(jobId, { status: 'failed' })
    } finally {
      await closeBrowser(handle)
    }
  })
})
