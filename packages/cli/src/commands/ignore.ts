import { Command } from 'commander'
export function registerIgnoreCommand(program: Command): void {
  program.command('ignore').description('Manage ignore patterns').action(() => {})
}
