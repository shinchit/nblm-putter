import { Command } from 'commander'
import { launchHeaded, closeBrowser } from '../playwright/browser'
import { loginWithGoogle } from '../playwright/notebooklm'
import { captureAndSaveSession } from '../playwright/session'

export function registerAuthCommand(program: Command): void {
  program
    .command('auth')
    .description('Authenticate with Google and save session')
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
    })
}
