import { Command } from 'commander'
import { createApp } from '../server/app'

export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('Start local web UI at http://localhost:3000')
    .option('-p, --port <port>', 'Port number', '3000')
    .action((opts: { port: string }) => {
      const port = parseInt(opts.port, 10)
      const app = createApp()
      app.listen(port, () => {
        const url = `http://localhost:${port}`
        console.log(`✓ Web UI running at ${url}`)
        import('open').then(({ default: open }) => open(url)).catch(() => {
          console.log(`Open your browser at ${url}`)
        })
      })
    })
}
