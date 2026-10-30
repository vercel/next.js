// Drives `next dev` against a fixture directory and records what happens.
//
// Usage: node drive-dev.mjs <nextBin> <appDir> <stepsJson> <logFile> [--turbopack|--webpack]
//
// Steps run in order:
// - {wait: "regex", timeout?}: wait for server output to match
// - {fetch: "/path", timeout?, bodyChars?}: request a page, log status and time
// - {write: "rel/path", content}: write a fixture file
// - {rm: "rel/path"}: delete a fixture file or directory
// - {rename: ["/abs/from", "/abs/to"]}: rename anything, undone at the end
// - {sleep: ms}
// - {mark: "label"}: add a label to the log
//
// Renames are undone in reverse order when the driver finishes, including on
// Ctrl-C, because one scenario renames node_modules/next.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

const [nextBin, appDir, stepsJson, logFile, bundlerFlag = '--turbopack'] =
  process.argv.slice(2)
const steps = JSON.parse(fs.readFileSync(stepsJson, 'utf8'))
const port = 40000 + Math.floor(Math.random() * 20000)
let output = ''
const log = (line) => {
  output += `\n[driver] ${line}\n`
}

const child = spawn(
  process.execPath,
  [nextBin, 'dev', bundlerFlag, '--port', String(port), appDir],
  {
    cwd: appDir,
    detached: true,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      // Needed where FSEvents is unavailable (the Claude Code sandbox).
      WATCHPACK_POLLING: 'true',
      FORCE_COLOR: '0',
    },
  }
)
let exited = null
child.stdout.on('data', (d) => (output += d.toString()))
child.stderr.on('data', (d) => (output += d.toString()))
child.on('exit', (code, signal) => {
  exited = { code, signal }
  log(`next dev exited code=${code} signal=${signal}`)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const pendingRenames = []

function restoreRenames() {
  for (const [from, to] of pendingRenames.splice(0).reverse()) {
    try {
      fs.renameSync(to, from)
      log(`restored ${to} -> ${from}`)
    } catch (e) {
      log(`FAILED to restore ${to} -> ${from}: ${e.message}`)
    }
  }
}

function stopServer(signal) {
  if (exited) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

process.on('SIGINT', () => {
  restoreRenames()
  stopServer('SIGTERM')
  fs.writeFileSync(logFile, output)
  process.exit(130)
})

async function waitFor(regex, timeout = 60000) {
  const re = new RegExp(regex)
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (re.test(output)) return true
    if (exited) return false
    await sleep(100)
  }
  return false
}

async function runStep(step) {
  if (step.wait) {
    const ok = await waitFor(step.wait, step.timeout)
    log(`wait /${step.wait}/ -> ${ok ? 'matched' : 'TIMEOUT/EXITED'}`)
  } else if (step.fetch) {
    if (exited) {
      log(`fetch ${step.fetch} skipped: server exited`)
      return
    }
    const startedAt = Date.now()
    try {
      const res = await fetch(`http://localhost:${port}${step.fetch}`, {
        signal: AbortSignal.timeout(step.timeout ?? 60000),
      })
      const body = await res.text()
      log(
        `fetch ${step.fetch} -> ${res.status} in ${Date.now() - startedAt}ms ${JSON.stringify(body.slice(0, step.bodyChars ?? 120))}`
      )
    } catch (e) {
      log(
        `fetch ${step.fetch} -> ERROR after ${Date.now() - startedAt}ms ${e.message}`
      )
    }
  } else if (step.write) {
    const file = path.join(appDir, step.write)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, step.content)
    log(`wrote ${step.write}`)
  } else if (step.rm) {
    fs.rmSync(path.join(appDir, step.rm), { recursive: true, force: true })
    log(`removed ${step.rm}`)
  } else if (step.rename) {
    const [from, to] = step.rename
    fs.renameSync(from, to)
    const undo = pendingRenames.findIndex(([a, b]) => a === to && b === from)
    if (undo === -1) pendingRenames.push([from, to])
    else pendingRenames.splice(undo, 1)
    log(`renamed ${from} -> ${to}`)
  } else if (step.sleep) {
    await sleep(step.sleep)
    log(`slept ${step.sleep}ms`)
  } else if (step.mark) {
    log(`==== ${step.mark} ====`)
  }
}

// Strips ANSI codes and sandbox/startup noise so the result fits on a screen.
function summarize(text) {
  const noise = [
    /trust settings/,
    /AGENTS\.md/,
    /upgrade instructions/,
    /git repository is dirty/,
  ]
  return stripVTControlCharacters(text)
    .split('\n')
    .filter((line) => line.trim() && !noise.some((re) => re.test(line)))
    .map((line) => line.slice(0, 240))
    .join('\n')
}

try {
  for (const step of steps) {
    await runStep(step)
  }
} finally {
  restoreRenames()
  log(
    `final state: ${exited ? `exited ${JSON.stringify(exited)}` : 'still running'}`
  )
  if (!exited) {
    stopServer('SIGTERM')
    await sleep(1500)
    stopServer('SIGKILL')
  }
  fs.writeFileSync(logFile, output)
  console.log(summarize(output))
}
