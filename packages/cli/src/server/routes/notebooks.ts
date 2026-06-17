import { Router, Request, Response, IRouter } from 'express'
import { launchHeadless, closeBrowser } from '../../playwright/browser'
import { listNotebooks, createNotebook } from '../../playwright/notebooklm'

export const notebooksRouter: IRouter = Router()

notebooksRouter.get('/', async (_req: Request, res: Response) => {
  let handle
  try {
    handle = await launchHeadless()
    const notebooks = await listNotebooks(handle.context)
    res.json(notebooks)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('Session expired') ? 401 : 500
    res.status(status).json({ error: message })
  } finally {
    if (handle) await closeBrowser(handle)
  }
})

notebooksRouter.post('/', async (_req: Request, res: Response) => {
  let handle
  try {
    handle = await launchHeadless()
    const notebook = await createNotebook(handle.context)
    res.json(notebook)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('Session expired') ? 401 : 500
    res.status(status).json({ error: message })
  } finally {
    if (handle) await closeBrowser(handle)
  }
})
