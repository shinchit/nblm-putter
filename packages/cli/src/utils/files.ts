import { readdirSync } from 'fs'
import { join } from 'path'

export function walkDir(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkDir(fullPath))
    else results.push(fullPath)
  }
  return results
}
