import { Router, Request, Response, IRouter } from 'express'
import { saveSession } from '../../storage/index'
import type { BrowserContextOptions } from 'playwright'

type StorageState = NonNullable<BrowserContextOptions['storageState']>

export const sessionRouter: IRouter = Router()

sessionRouter.post('/', async (req: Request, res: Response) => {
  try {
    await saveSession(req.body as StorageState)
    res.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})
