import express from 'express'
import { join } from 'path'
import { existsSync } from 'fs'
import { jobsRouter } from './routes/jobs'
import { settingsRouter } from './routes/settings'
import { notebooksRouter } from './routes/notebooks'
import { sessionRouter } from './routes/session'
import { syncRouter } from './routes/sync'
import { folderRouter } from './routes/folder'

export function createApp(): express.Application {
  const app = express()
  app.use(express.json())

  app.use('/api/jobs', jobsRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/notebooks', notebooksRouter)
  app.use('/api/session', sessionRouter)
  app.use('/api/sync', syncRouter)
  app.use('/api/folder', folderRouter)

  const publicDir = join(__dirname, '..', 'public')
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir))
    app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')))
  }

  return app
}
