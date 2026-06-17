import { Router, Request, Response, IRouter } from 'express'
import { launchHeadless, closeBrowser } from '../../playwright/browser'
import { listNotebooks } from '../../playwright/notebooklm'

export const notebooksRouter: IRouter = Router()

notebooksRouter.get('/', async (_req: Request, res: Response) => {
  const handle = await launchHeadless()
  try {
    const notebooks = await listNotebooks(handle.context)
    res.json(notebooks)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  } finally {
    await closeBrowser(handle)
  }
})
