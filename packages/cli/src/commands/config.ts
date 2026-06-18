import { Command } from 'commander'
import * as readline from 'readline'
import { readConfig, writeConfig } from '../config'

function prompt(question: string, defaultVal: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.on('error', () => { rl.close(); resolve(defaultVal) })
    rl.question(`${question} (${defaultVal}): `, answer => {
      rl.close()
      resolve(answer.trim() || defaultVal)
    })
  })
}

export function registerConfigCommand(program: Command): void {
  const config = program.command('config')

  config
    .command('init')
    .description('Initialize nblm-putter configuration')
    .action(async () => {
      const current = readConfig()
      const region = await prompt('AWS region', current.aws.region)
      const profile = await prompt('AWS profile', current.aws.profile)
      const smInput = await prompt('Use Secrets Manager for cross-machine sync? (y/n)', current.useSecretsManager ? 'y' : 'n')
      const clientId = await prompt('Google Cloud OAuth2 Client ID (for Drive sync, Enter to skip)', current.drive.clientId)
      const clientSecret = await prompt('Google Cloud OAuth2 Client Secret (for Drive sync, Enter to skip)', current.drive.clientSecret)
      writeConfig({
        useSecretsManager: smInput.toLowerCase() === 'y',
        aws: { region, profile },
        drive: { clientId, clientSecret },
      })
      console.log('✓ Configuration saved.')
    })
}
