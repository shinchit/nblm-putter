import { minimatch } from 'minimatch'
import { relative } from 'path'

export function filterFiles(files: string[], baseDir: string, patterns: string[]): string[] {
  if (patterns.length === 0) return files
  return files.filter(file => {
    const rel = relative(baseDir, file).replace(/\\/g, '/')
    return !patterns.some(pattern => {
      const p = pattern.endsWith('/') ? pattern + '**' : pattern
      return minimatch(rel, p, { dot: true }) || minimatch(rel, '**/' + p, { dot: true })
    })
  })
}
