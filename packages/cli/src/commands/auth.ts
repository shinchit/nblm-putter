import { Command } from 'commander'
import { createServer } from 'http'
import { google } from 'googleapis'
import { launchHeaded, closeBrowser } from '../playwright/browser'
import { loginWithGoogle } from '../playwright/notebooklm'
import { captureAndSaveSession } from '../playwright/session'
import { readConfig } from '../config'
import { saveDriveToken } from '../drive/token'

async function authDrive(): Promise<void> {
  const { drive } = readConfig()
  if (!drive.clientId || !drive.clientSecret) {
    console.log('⚠ Drive credentials not set. Skipping Drive auth. Run `nblm-putter config init` to configure.')
    return
  }

  const oauth2 = new google.auth.OAuth2(
    drive.clientId,
    drive.clientSecret,
    'http://localhost:3001/callback'
  )

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
  })

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost:3001')
      const c = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body>Drive 認証完了。このタブを閉じてください。</body></html>')
      server.close()
      if (c) resolve(c)
      else reject(new Error('No authorization code in callback'))
    })
    server.listen(3001, () => {
      console.log('Drive 認証ページを開いています...')
      import('open').then(({ default: open }) => open(authUrl)).catch(() => {
        console.log(`ブラウザで以下の URL を開いてください:\n${authUrl}`)
      })
    })
    server.on('error', reject)
  })

  const { tokens } = await oauth2.getToken(code)
  saveDriveToken({
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
    expiry_date: tokens.expiry_date!,
  })
  console.log('✓ Drive authorization saved.')
}

export function registerAuthCommand(program: Command): void {
  program
    .command('auth')
    .description('Authenticate with Google (NotebookLM session + Drive OAuth2)')
    .action(async () => {
      console.log('Opening browser for Google login...')
      const handle = await launchHeaded()
      try {
        const page = await handle.context.newPage()
        await loginWithGoogle(page)
        await captureAndSaveSession(handle.context)
        console.log('✓ Session saved successfully.')
      } finally {
        await closeBrowser(handle)
      }
      await authDrive()
    })
}
