import { describe, it, expect } from 'vitest'
import { filterFiles } from '../../src/ignore/filter'

describe('filterFiles', () => {
  const files = [
    '/project/src/index.ts',
    '/project/node_modules/react/index.js',
    '/project/dist/bundle.js',
    '/project/logs/app.log',
    '/project/README.md',
    '/project/.git/config',
  ]

  it('returns all files when no patterns', () => {
    expect(filterFiles(files, '/project', [])).toEqual(files)
  })

  it('excludes node_modules/', () => {
    const result = filterFiles(files, '/project', ['node_modules/'])
    expect(result).not.toContain('/project/node_modules/react/index.js')
    expect(result).toContain('/project/src/index.ts')
  })

  it('excludes *.log pattern', () => {
    const result = filterFiles(files, '/project', ['*.log'])
    expect(result).not.toContain('/project/logs/app.log')
  })

  it('excludes dist/ directory', () => {
    const result = filterFiles(files, '/project', ['dist/'])
    expect(result).not.toContain('/project/dist/bundle.js')
  })

  it('applies multiple patterns', () => {
    const result = filterFiles(files, '/project', ['node_modules/', '*.log', '.git/'])
    expect(result).toHaveLength(3)
    expect(result).toContain('/project/src/index.ts')
    expect(result).toContain('/project/README.md')
    expect(result).toContain('/project/dist/bundle.js')
  })
})
