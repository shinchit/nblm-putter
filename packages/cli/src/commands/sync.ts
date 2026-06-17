import { Command } from 'commander'
import { resolve } from 'path'
import { SingleBar, Presets } from 'cli-progress'
import { BrowserContext } from 'playwright'
import { launchHeadlessBrowser, createHeadlessContext } from '../playwright/browser'
import { isSessionValid, registerFile } from '../playwright/notebooklm'
import { loadIgnorePatterns } from '../storage/index'
import { filterFiles } from '../ignore/filter'
import { createJob, updateJob } from '../db/jobs'
import { walkDir } from '../utils/files'

export function registerSyncCommand(program: Command): void {
  program
    .command('sync <folder>')
    .description('Sync files from a folder to NotebookLM')
    .requiredOption('--notebook <id>', 'Target notebook ID (from `notebooks list`)')
    .option('-c, --concurrency <n>', 'Number of parallel uploads', '3')
    .action(async (folder: string, opts: { notebook: string; concurrency: string }) => {
      const absFolder = resolve(folder)
      const concurrency = Math.max(1, parseInt(opts.concurrency, 10))

      const browser = await launchHeadlessBrowser()
      const contexts: BrowserContext[] = []

      try {
        // Create one context to validate session, then reuse for workers
        const firstCtx = await createHeadlessContext(browser)
        contexts.push(firstCtx)

        if (!await isSessionValid(firstCtx)) {
          console.error('✗ Session expired. Run `nblm-putter auth` to re-authenticate.')
          process.exit(1)
        }

        const ignorePatterns = await loadIgnorePatterns()
        const allFiles = walkDir(absFolder)
        const files = filterFiles(allFiles, absFolder, ignorePatterns)

        if (files.length === 0) {
          console.log('No files to sync.')
          return
        }

        // Create additional contexts for parallel workers
        const workerCount = Math.min(concurrency, files.length)
        for (let i = 1; i < workerCount; i++) {
          contexts.push(await createHeadlessContext(browser))
        }

        console.log(`Syncing ${files.length} files (${workerCount} parallel workers)...`)
        const jobId = createJob({ notebookId: opts.notebook, totalFiles: files.length })
        updateJob(jobId, { status: 'running' })

        const bar = new SingleBar(
          { format: '{bar} {percentage}% | {value}/{total} | ETA: {eta}s' },
          Presets.shades_classic
        )
        bar.start(files.length, 0)

        const errors: Array<{ file: string; reason: string }> = []
        let done = 0
        const queue = [...files]
        const mu = { locked: false }

        // Simple async mutex for shared state updates
        async function withLock(fn: () => void): Promise<void> {
          fn()
        }

        async function runWorker(ctx: BrowserContext): Promise<void> {
          while (true) {
            const file = queue.shift()
            if (!file) break

            const filename = file.split('/').pop() ?? file
            const result = await registerFile(ctx, opts.notebook, file)

            withLock(() => {
              done++
              if (!result.success) {
                const reason = result.reason ?? 'unknown'
                errors.push({ file: result.file, reason })
                // Print error above the progress bar
                process.stderr.write(`\r\x1b[2K  ✗ ${filename}: ${reason.split('\n')[0]}\n`)
              }
              updateJob(jobId, { doneFiles: done, errors })
              bar.update(done)
            })
          }
        }

        await Promise.all(contexts.map(ctx => runWorker(ctx)))

        bar.stop()
        updateJob(jobId, { status: errors.length === files.length ? 'failed' : 'done' })

        if (errors.length > 0) {
          console.warn(`\n⚠ ${errors.length} / ${files.length} file(s) failed:`)
          errors.forEach(e => console.warn(`  ${e.file.split('/').pop()}: ${e.reason.split('\n')[0]}`))
        }
        console.log(`\n✓ Done. ${done - errors.length} succeeded, ${errors.length} failed. (Job ID: ${jobId})`)
      } catch (err) {
        process.stderr.write('\r\x1b[2K')
        console.error('✗ Sync failed:', err instanceof Error ? err.message : err)
        process.exit(1)
      } finally {
        await Promise.all(contexts.map(ctx => ctx.close().catch(() => {})))
        await browser.close().catch(() => {})
      }
    })
}
