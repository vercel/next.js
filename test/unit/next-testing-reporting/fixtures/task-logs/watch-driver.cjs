const fs = require('node:fs/promises')
const path = require('node:path')
const childProcess = require('node:child_process')
const { spawn } = childProcess
const fsSync = require('node:fs')
const { pathToFileURL } = require('node:url')
async function sourceWatchEngine(root, testing, evidence) {
  // Observe the real input subscriptions without replacing the watcher.
  const fork = childProcess.fork
  childProcess.fork = function (...args) {
    const child = fork.apply(this, args)
    const send = child.send
    child.send = function (message, ...rest) {
      const request = message?.type === 'run' ? message.input : message
      if (['watch-source-open', 'watch-source-update'].includes(request?.type))
        fsSync.appendFileSync(
          path.join(evidence, 'watch-subscriptions.jsonl'),
          JSON.stringify(request) + '\n'
        )
      return send.call(this, message, ...rest)
    }
    return child
  }
  const { watchTests } = await import(
    pathToFileURL(path.join(testing, 'watch-orchestrator.js')).href
  )
  const { parseResultReporters } = await import(
    pathToFileURL(path.join(testing, 'reporting/machine.js')).href
  )
  const controller = new AbortController()
  const stop = () =>
    controller.abort(new Error('Owned logs engine component closed.'))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    const result = await watchTests(root, {
      signal: controller.signal,
      resultReporters: parseResultReporters(['./reporter.mjs']),
      write: (text) => process.stdout.write(text),
      writeError: (text) => process.stderr.write(text),
      onEvent(event) {
        fsSync.appendFileSync(
          path.join(evidence, 'watch-events.jsonl'),
          JSON.stringify(event) + '\n'
        )
      },
    })
    fsSync.writeFileSync(
      path.join(evidence, 'watch-engine-result.json'),
      JSON.stringify(result)
    )
  } finally {
    childProcess.fork = fork
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}

async function main() {
  const [root, bin, engine, evidence = root] = process.argv.slice(2)
  if (engine === 'source-engine') return sourceWatchEngine(root, bin, evidence)
  const args = [
    __filename,
    root,
    path.resolve(path.dirname(bin), '../experimental/testing'),
    'source-engine',
    evidence,
  ]
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stopRequested = false
  process.on('SIGINT', () => {
    stopRequested = true
  })
  process.on('SIGTERM', () => {
    stopRequested = true
  })
  let stdout = '',
    stderr = '',
    closed = false
  child.stdout.on('data', (chunk) => (stdout += chunk.toString()))
  child.stderr.on('data', (chunk) => (stderr += chunk.toString()))
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      closed = true
      resolve({ code, signal })
    })
  })
  try {
    let patched = false
    while (true) {
      let rows = []
      try {
        const data = await fs.readFile(path.join(root, 'trace.jsonl'), 'utf8')
        rows = data
          .slice(0, data.lastIndexOf('\n'))
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      const runs = rows.filter((row) => row.hook === 'end').length
      if (
        (runs >= 2 && rows.filter((row) => row.hook === 'ready').length >= 2) ||
        stopRequested
      )
        break
      if (closed)
        throw new Error(
          'Watch process exited before the second real run: ' +
            JSON.stringify(await exited) +
            '\n' +
            stdout +
            '\n' +
            stderr
        )
      if (runs === 1 && rows.some((row) => row.hook === 'ready') && !patched) {
        patched = true
        const file = path.join(root, 'watch.case.mjs')
        const body = await fs.readFile(file, 'utf8')
        await fs.writeFile(
          file,
          body
            .replaceAll('LABEL1', 'LABEL2')
            .replace('const generation = 1', 'const generation = 2')
        )
      }
      await new Promise((resolve) => setImmediate(resolve))
    }
    child.kill('SIGINT')
    const result = await exited
    await fs.writeFile(
      path.join(evidence, 'watch-exit.json'),
      JSON.stringify(result)
    )
  } finally {
    if (!closed) {
      child.kill('SIGKILL')
      await exited
    }
    await fs.writeFile(path.join(evidence, 'watch-stdout.log'), stdout)
    await fs.writeFile(path.join(evidence, 'watch-stderr.log'), stderr)
  }
}
main().catch((error) => {
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
