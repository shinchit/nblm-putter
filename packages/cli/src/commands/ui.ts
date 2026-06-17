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
      const server = app.listen(port)
      server.on('listening', () => {
        const url = `http://localhost:${port}`
        console.log(`✓ Web UI running at ${url}`)
        import('open').then(({ default: open }) => open(url)).catch(() => {
          console.log(`Open your browser at ${url}`)
        })
      })
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`✗ Port ${port} is already in use. Try --port <other-port>`)
        } else {
          console.error('✗ Server error:', err.message)
        }
        process.exit(1)
      })
    })
}
