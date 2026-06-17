import { Command } from 'commander'
import { launchHeadless, closeBrowser } from '../playwright/browser'
import { isSessionValid, listNotebooks } from '../playwright/notebooklm'

export function registerNotebooksCommand(program: Command): void {
  const notebooks = program.command('notebooks')

  notebooks
    .command('list')
    .description('List all notebooks in NotebookLM')
    .action(async () => {
      const handle = await launchHeadless()
      try {
        if (!await isSessionValid(handle.context)) {
          console.error('✗ Session expired. Run `nblm-putter auth` to re-authenticate.')
          process.exit(1)
        }
        console.log('Fetching notebooks...')
        const notebooks = await listNotebooks(handle.context)
        if (notebooks.length === 0) {
          console.log('No notebooks found.')
          return
        }
        console.log('\nNotebooks:')
        notebooks.forEach(nb => console.log(`  ${nb.id}  ${nb.title}`))
      } finally {
        await closeBrowser(handle)
      }
    })
}
