import { Command } from 'commander'
import { resolve, basename } from 'path'
import { SingleBar, Presets } from 'cli-progress'
import { launchHeadlessBrowser, createHeadlessContext } from '../playwright/browser'
import { openNotebookPage } from '../playwright/notebooklm'
import { addSourcesFromDrive } from '../playwright/drive-picker'
import { loadIgnorePatterns } from '../storage/index'
import { filterFiles } from '../ignore/filter'
import { createJob, updateJob } from '../db/jobs'
import { walkDir } from '../utils/files'
import { getOrCreateFolder, uploadFile } from '../drive/client'

export function registerSyncCommand(program: Command): void {
  program
    .command('sync <folder>')
    .description('Sync files from a folder to NotebookLM via Google Drive')
    .requiredOption('--notebook <id>', 'Target notebook ID (from `notebooks list`)')
    .option('--force-overwrite', 'Overwrite existing files in Drive instead of skipping them')
    .action(async (folder: string, opts: { notebook: string; forceOverwrite?: boolean }) => {
      const absFolder = resolve(folder)
      const ignorePatterns = await loadIgnorePatterns()
      const files = filterFiles(walkDir(absFolder), absFolder, ignorePatterns)

      if (files.length === 0) {
        console.log('No files to sync.')
        return
      }

      console.log(`Phase 1: Uploading ${files.length} files to Google Drive...`)
      const jobId = createJob({ notebookId: opts.notebook, totalFiles: files.length })
      updateJob(jobId, { status: 'running' })

      let rootFolderId: string
      let notebookFolderId: string
      try {
        rootFolderId = await getOrCreateFolder(null, 'nblm-putter')
        notebookFolderId = await getOrCreateFolder(rootFolderId, opts.notebook)
      } catch (err) {
        console.error('✗ Drive folder setup failed:', err instanceof Error ? err.message : err)
        process.exit(1)
      }

      const bar = new SingleBar(
        { format: '{bar} {percentage}% | {value}/{total} | ETA: {eta}s' },
        Presets.shades_classic
      )
      bar.start(files.length, 0)

      const errors: Array<{ file: string; reason: string }> = []
      const newlyUploaded: string[] = []
      let done = 0
      let skipped = 0

      for (const file of files) {
        const name = basename(file)
        process.stderr.write(`\r\x1b[2K  → ${name}`)
        try {
          const result = await uploadFile(file, notebookFolderId, opts.forceOverwrite)
          if (result.status === 'skipped') {
            skipped++
            process.stdout.write(`  SKIP  ${name}\n`)
          } else {
            newlyUploaded.push(name)
          }
        } catch (err) {
          errors.push({ file, reason: err instanceof Error ? err.message : String(err) })
        }
        done++
        updateJob(jobId, { doneFiles: done, errors })
        bar.update(done)
      }

      process.stderr.write('\r\x1b[2K')
      bar.stop()

      if (errors.length > 0) {
        console.warn(`\n⚠ ${errors.length} file(s) failed to upload to Drive:`)
        errors.forEach(e => console.warn(`  ${basename(e.file)}: ${e.reason}`))
      }

      if (newlyUploaded.length === 0) {
        updateJob(jobId, { status: 'done' })
        console.log(`\n✓ Done. 全ファイルが既に Drive に存在するためスキップしました。(skipped: ${skipped}, Job ID: ${jobId})`)
        return
      }

      console.log(`\nPhase 2: Adding ${newlyUploaded.length} new source(s) to NotebookLM via Drive picker...`)

      const browser = await launchHeadlessBrowser()
      try {
        const ctx = await createHeadlessContext(browser)
        const page = await openNotebookPage(ctx, opts.notebook)
        await addSourcesFromDrive(page, opts.notebook, newlyUploaded)
        await page.close()
        await ctx.close().catch(() => {})
      } catch (err) {
        console.error('✗ Drive picker failed:', err instanceof Error ? err.message : err)
        updateJob(jobId, { status: 'failed' })
        process.exit(1)
      } finally {
        await browser.close().catch(() => {})
      }

      updateJob(jobId, { status: errors.length === files.length ? 'failed' : 'done' })
      console.log(`✓ Done. ${newlyUploaded.length} file(s) uploaded and added to NotebookLM. (skipped: ${skipped}, Job ID: ${jobId})`)
    })
}
