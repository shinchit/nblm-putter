import { Router, Request, Response, IRouter } from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'

export const folderRouter: IRouter = Router()

const execFileAsync = promisify(execFile)

async function pickFolderPath(): Promise<string | null> {
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder)'])
    return stdout.trim() || null
  }

  if (process.platform === 'win32') {
    // Use a hidden TopMost owner form so the dialog surfaces in front of all windows.
    // -Sta is required for Windows Forms (STA apartment mode).
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.WindowState = 'Minimized'
$owner.ShowInTaskbar = $false
$owner.Show()
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'フォルダを選択してください'
$d.ShowNewFolderButton = $true
if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $d.SelectedPath
}
$owner.Close()
`
    const { stdout } = await execFileAsync('powershell', ['-Sta', '-NoProfile', '-Command', ps])
    return stdout.trim() || null
  }

  // Linux: try zenity, fall back to null
  const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory']).catch(() => ({ stdout: '' }))
  return stdout.trim() || null
}

folderRouter.get('/pick', async (_req: Request, res: Response) => {
  try {
    const path = await pickFolderPath()
    res.json({ path })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('User canceled') || msg.includes('cancelled')) {
      res.json({ path: null })
    } else {
      res.status(500).json({ error: msg })
    }
  }
})
