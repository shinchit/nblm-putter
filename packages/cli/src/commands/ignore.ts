import { Command } from 'commander'
import { loadIgnorePatterns, saveIgnorePatterns } from '../storage/index'

export function registerIgnoreCommand(program: Command): void {
  const ignore = program.command('ignore')

  ignore
    .command('list')
    .description('List ignore patterns')
    .action(async () => {
      const patterns = await loadIgnorePatterns()
      if (patterns.length === 0) {
        console.log('No ignore patterns set.')
        return
      }
      patterns.forEach(p => console.log(`  ${p}`))
    })

  ignore
    .command('add <pattern>')
    .description('Add an ignore pattern (e.g. "*.log", "node_modules/")')
    .action(async (pattern: string) => {
      const patterns = await loadIgnorePatterns()
      if (patterns.includes(pattern)) {
        console.log(`Pattern already exists: ${pattern}`)
        return
      }
      await saveIgnorePatterns([...patterns, pattern])
      console.log(`✓ Added: ${pattern}`)
    })

  ignore
    .command('remove <pattern>')
    .description('Remove an ignore pattern')
    .action(async (pattern: string) => {
      const patterns = await loadIgnorePatterns()
      if (!patterns.includes(pattern)) {
        console.log(`Pattern not found: ${pattern}`)
        return
      }
      await saveIgnorePatterns(patterns.filter(p => p !== pattern))
      console.log(`✓ Removed: ${pattern}`)
    })
}
