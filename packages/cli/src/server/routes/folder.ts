import { Router, Request, Response, IRouter } from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'

export const folderRouter: IRouter = Router()

const execFileAsync = promisify(execFile)

folderRouter.get('/pick', async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder)'])
    res.json({ path: stdout.trim() })
  } catch (err: unknown) {
    // User cancelled the dialog — osascript exits with code 1
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('User canceled')) {
      res.json({ path: null })
    } else {
      res.status(500).json({ error: msg })
    }
  }
})
