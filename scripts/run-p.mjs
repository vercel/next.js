// Runs multiple scripts in parallel using pnpm

import { spawn } from 'child_process'

for (const script of process.argv.slice(2)) {
  spawn('pnpm', ['run', script], {
    stdio: 'inherit',
    shell: true,
  })
    .on('error', (error) => {
      console.error(`Error: ${error.message}`)
      process.exit(1)
    })
    .on('close', (code) => {
      console.log(`script "${script}" exited with code ${code}`)
      process.exit(code)
    })
}
