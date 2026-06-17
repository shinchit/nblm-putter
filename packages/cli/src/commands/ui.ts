import { Command } from 'commander'
export function registerUiCommand(program: Command): void {
  program.command('ui').description('Start local web UI').action(() => {})
}
