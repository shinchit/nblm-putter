import { Command } from 'commander'
import { resolve } from 'path'
import { SingleBar, Presets } from 'cli-progress'
import { launchHeadlessBrowser, createHeadlessContext } from '../playwright/browser'
import { isSessionValid, openNotebookPage, uploadFileOnPage } from '../playwright/notebooklm'
import { loadIgnorePatterns } from '../storage/index'
import { filterFiles } from '../ignore/filter'
import { createJob, updateJob } from '../db/jobs'
import { walkDir } from '../utils/files'

export function registerSyncCommand(program: Command): void {
  program
    .command('sync <folder>')
    .description('Sync files from a folder to NotebookLM')
    .requiredOption('--notebook <id>', 'Target notebook ID (from `notebooks list`)')
    .option('-c, --concurrency <n>', 'Number of parallel browser pages (default: 1; >1 may conflict on the same notebook)', '1')
    .action(async (folder: string, opts: { notebook: string; concurrency: string }) => {
      const absFolder = resolve(folder)
      const concurrency = Math.max(1, parseInt(opts.concurrency, 10))

      const browser = await launchHeadlessBrowser()
      try {
        const firstCtx = await createHeadlessContext(browser)

        if (!await isSessionValid(firstCtx)) {
          console.error('✗ Session expired. Run `nblm-putter auth` to re-authenticate.')
          process.exit(1)
        }

        const ignorePatterns = await loadIgnorePatterns()
        const allFiles = walkDir(absFolder)
        const files = filterFiles(allFiles, absFolder, ignorePatterns)

        if (files.length === 0) {
          console.log('No files to sync.')
          await firstCtx.close()
          return
        }

        const workerCount = Math.min(concurrency, files.length)
        console.log(
          workerCount === 1
            ? `Syncing ${files.length} files...`
            : `Syncing ${files.length} files (${workerCount} parallel pages — note: same notebook may serialize uploads)...`
        )

        const jobId = createJob({ notebookId: opts.notebook, totalFiles: files.length })
        updateJob(jobId, { status: 'running' })

        const bar = new SingleBar(
          { format: '{bar} {percentage}% | {value}/{total} | ETA: {eta}s' },
          Presets.shades_classic
        )
        bar.start(files.length, 0)

        const errors: Array<{ file: string; reason: string }> = []
        let done = 0

        // Build per-worker file lists (round-robin split)
        const workerFiles: string[][] = Array.from({ length: workerCount }, () => [])
        files.forEach((f, i) => workerFiles[i % workerCount].push(f))

        // Create contexts (reuse firstCtx for worker 0)
        const contexts = [firstCtx]
        for (let i = 1; i < workerCount; i++) {
          contexts.push(await createHeadlessContext(browser))
        }

        async function runWorker(ctxIndex: number): Promise<void> {
          const ctx = contexts[ctxIndex]
          const myFiles = workerFiles[ctxIndex]
          if (myFiles.length === 0) return

          // Open notebook page ONCE — reuse across all files for this worker
          const page = await openNotebookPage(ctx, opts.notebook)
          try {
            for (const file of myFiles) {
              const filename = file.split('/').pop() ?? file
              process.stderr.write(`\r\x1b[2K  → ${filename}`)

              const result = await uploadFileOnPage(page, file)
              done++

              if (!result.success) {
                const reason = result.reason ?? 'unknown'
                errors.push({ file: result.file, reason })
                process.stderr.write(`\r\x1b[2K  ✗ ${filename}: ${reason.split('\n')[0]}\n`)
              } else {
                process.stderr.write('\r\x1b[2K')
              }

              updateJob(jobId, { doneFiles: done, errors })
              bar.update(done)
            }
          } finally {
            await page.close()
          }
        }

        await Promise.all(contexts.map((_, i) => runWorker(i)))

        process.stderr.write('\r\x1b[2K')
        bar.stop()
        updateJob(jobId, { status: errors.length === files.length ? 'failed' : 'done' })

        if (errors.length > 0) {
          console.warn(`\n⚠ ${errors.length} / ${files.length} file(s) failed:`)
          errors.forEach(e => console.warn(`  ${e.file.split('/').pop()}: ${e.reason.split('\n')[0]}`))
        }
        console.log(`\n✓ Done. ${done - errors.length} succeeded, ${errors.length} failed. (Job ID: ${jobId})`)

        await Promise.all(contexts.map(ctx => ctx.close().catch(() => {})))
      } catch (err) {
        process.stderr.write('\r\x1b[2K')
        console.error('✗ Sync failed:', err instanceof Error ? err.message : err)
        process.exit(1)
      } finally {
        await browser.close().catch(() => {})
      }
    })
}
