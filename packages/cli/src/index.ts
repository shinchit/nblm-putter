#!/usr/bin/env node
import { Command } from 'commander'
import { registerConfigCommand } from './commands/config'
import { registerAuthCommand } from './commands/auth'
import { registerNotebooksCommand } from './commands/notebooks'
import { registerIgnoreCommand } from './commands/ignore'
import { registerSyncCommand } from './commands/sync'
import { registerUiCommand } from './commands/ui'

const program = new Command()

program
  .name('nblm-putter')
  .description('Automatically register local files into NotebookLM')
  .version('0.1.0')

registerConfigCommand(program)
registerAuthCommand(program)
registerNotebooksCommand(program)
registerIgnoreCommand(program)
registerSyncCommand(program)
registerUiCommand(program)

program.parse()
