const assert = require('node:assert/strict')
const runPublicProcess = require('./public-process.cjs')

async function main() {
  const mode = process.argv[2]
  const controller = new AbortController()
  const pids = new Set()
  const deadline = setTimeout(() => controller.abort(), 10000)
  try {
    await assert.rejects(
      runPublicProcess(
        [
          '-e',
          `
        const { spawn } = require('node:child_process')
        process.on('SIGINT', () => {})
        process.on('SIGTERM', () => {})
        const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.send('ready')"], { detached: true, stdio: ['ignore', '${mode === 'leak' ? 'ignore' : 'inherit'}', '${mode === 'leak' ? 'ignore' : 'inherit'}', 'ipc'] })
        child.once('message', () => {
          console.log('OWNED_PID=' + process.pid)
          console.log('OWNED_PID=' + child.pid)
          console.log('STUCK_READY')
          if (${mode === 'leak'}) process.stdout.write('EXITING\\n', () => process.exit(130))
        })
        setInterval(() => {}, 1000)
      `,
        ],
        {
          cwd: process.cwd(),
          signal: controller.signal,
          getOwnedPids: () => [...pids],
          write(text) {
            const match = text.match(/OWNED_PID=(\d+)/)
            if (match) pids.add(Number(match[1]))
            if (mode === 'hang' && text.includes('STUCK_READY'))
              controller.abort()
          },
        }
      ),
      mode === 'leak'
        ? /left owned processes alive/
        : /did not close after SIGINT/
    )
    assert.equal(pids.size, 2)
    for (const pid of pids)
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    console.log('STUCK_CLI_CLEANED')
  } finally {
    clearTimeout(deadline)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
