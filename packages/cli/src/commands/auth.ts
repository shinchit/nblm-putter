import { Command } from 'commander'
export function registerAuthCommand(program: Command): void {
  program.command('auth').description('Authenticate with Google and save session').action(() => {
    console.log('Not yet implemented')
  })
}
