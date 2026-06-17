import { BrowserContext } from 'playwright'
import { saveSession } from '../storage/index'

export async function captureAndSaveSession(context: BrowserContext): Promise<void> {
  const state = await context.storageState()
  await saveSession(state)
}
