import { Command } from 'commander'
export function registerSyncCommand(program: Command): void {
  program.command('sync').description('Sync files to NotebookLM').argument('<folder>').option('--notebook <id>').action(() => {})
}
