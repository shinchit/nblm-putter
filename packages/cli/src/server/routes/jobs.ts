import { Router, Request, Response, IRouter } from 'express'
import { listJobs, getJob, cancelJob } from '../../db/jobs'

export const jobsRouter: IRouter = Router()

jobsRouter.get('/', (_req: Request, res: Response) => {
  res.json(listJobs())
})

jobsRouter.get('/:id', (req: Request, res: Response) => {
  const job = getJob(req.params.id)
  if (!job) { res.status(404).json({ error: 'Not found' }); return }
  res.json(job)
})

jobsRouter.post('/:id/cancel', (req: Request, res: Response) => {
  const job = getJob(req.params.id)
  if (!job) { res.status(404).json({ error: 'Not found' }); return }
  if (job.status !== 'running') { res.status(400).json({ error: 'Job is not running' }); return }
  cancelJob(req.params.id)
  res.json({ ok: true })
})
