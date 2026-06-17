import { Command } from 'commander'
export function registerNotebooksCommand(program: Command): void {
  program.command('notebooks').description('Manage notebooks').action(() => {})
}
