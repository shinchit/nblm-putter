import { Command } from 'commander'
import { resolve } from 'path'
import { SingleBar, Presets } from 'cli-progress'
import { launchHeadless, closeBrowser } from '../playwright/browser'
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
    .action(async (folder: string, opts: { notebook: string }) => {
      const absFolder = resolve(folder)
      const handle = await launchHeadless()

      try {
        if (!await isSessionValid(handle.context)) {
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

        console.log(`Syncing ${files.length} files to notebook ${opts.notebook}...`)
        const jobId = createJob({ notebookId: opts.notebook, totalFiles: files.length })
        updateJob(jobId, { status: 'running' })

        const bar = new SingleBar(
          { format: '{bar} {percentage}% | {value}/{total} | ETA: {eta}s' },
          Presets.shades_classic
        )
        bar.start(files.length, 0)

        const errors: Array<{ file: string; reason: string }> = []
        let done = 0

        for (const file of files) {
          const filename = file.split('/').pop() ?? file
          // Print current file below the bar so the user sees live progress
          process.stderr.write(`\r\x1b[2K  → ${filename}`)

          const result = await registerFile(handle.context, opts.notebook, file)
          done++

          if (!result.success) {
            const reason = result.reason ?? 'unknown'
            errors.push({ file: result.file, reason })
            // Clear the status line and print the error immediately
            process.stderr.write(`\r\x1b[2K  ✗ ${filename}: ${reason.split('\n')[0]}\n`)
          } else {
            process.stderr.write(`\r\x1b[2K`)
          }

          updateJob(jobId, { doneFiles: done, errors })
          bar.update(done)
        }

        // Clear the last status line
        process.stderr.write(`\r\x1b[2K`)
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
        await closeBrowser(handle)
      }
    })
}
