import { Router, Request, Response, IRouter } from 'express'
import { loadIgnorePatterns, saveIgnorePatterns } from '../../storage/index'

export const settingsRouter: IRouter = Router()

settingsRouter.get('/ignore', async (_req: Request, res: Response) => {
  res.json(await loadIgnorePatterns())
})

settingsRouter.put('/ignore', async (req: Request, res: Response) => {
  const { patterns } = req.body as { patterns: unknown }
  if (!Array.isArray(patterns)) {
    res.status(400).json({ error: 'patterns must be array' })
    return
  }
  await saveIgnorePatterns(patterns as string[])
  res.json({ ok: true })
})
