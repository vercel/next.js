import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

function state(pid) {
  const result = spawnSync(
    '/bin/ps',
    [
      '-o',
      'lstart=',
      '-o',
      'ppid=',
      '-o',
      'pgid=',
      '-o',
      'stat=',
      '-p',
      String(pid),
    ],
    { encoding: 'utf8', timeout: 1000 }
  )
  if (result.status === 1 && !result.stdout.trim()) return undefined
  if (result.status !== 0)
    throw new Error(`Cannot inspect owned process ${pid}: ${result.stderr}`)
  const fields = result.stdout.trim().split(/\s+/)
  const status = fields.pop()
  const pgid = Number(fields.pop())
  const ppid = Number(fields.pop())
  return { started: fields.join(' '), ppid, pgid, status }
}

/** Outer verifier ownership, independent of the product's process supervisor. */
export async function runOwnedNode(
  args,
  { cwd, env, auditDir, timeoutMs, graceMs = 200, cleanupMs = 3000 }
) {
  mkdirSync(auditDir)
  const audit = join(auditDir, 'starts.jsonl')
  writeFileSync(audit, '', { flag: 'wx' })
  const preload = join(auditDir, 'startup.cjs')
  copyFileSync(
    fileURLToPath(new URL('./process-start-audit.cjs', import.meta.url)),
    preload
  )
  const token = randomUUID()
  const known = new Map()
  const starts = new Set()
  const spawns = new Map()
  const pendingSpawns = new Map()
  const registrationFailures = new Map()
  const cleanupFailures = []
  function readStarts() {
    const text = readFileSync(audit, 'utf8')
    const lines = text.split('\n')
    lines.pop() // An in-progress final append is inspected on the next pass.
    for (const line of lines) {
      const record = JSON.parse(line)
      if (
        record.token !== token ||
        !Number.isInteger(record.pid) ||
        record.pid <= 1
      ) {
        throw new Error('Invalid owned process startup record')
      }
      if (record.type === 'spawn-pending') {
        pendingSpawns.set(record.pid, record)
        continue
      }
      if (record.type === 'spawn-error') {
        registrationFailures.set(`${record.pid}:${record.error}`, record)
        continue
      }
      if (record.type !== 'start' && record.type !== 'spawn') {
        throw new Error('Unknown owned process record')
      }
      if (record.type === 'spawn') {
        pendingSpawns.delete(record.pid)
        spawns.set(record.pid, record)
        if (record.absent) continue
      }
      if (
        !Number.isInteger(record.pgid) ||
        record.pgid <= 1 ||
        typeof record.started !== 'string'
      ) {
        throw new Error('Missing owned process identity')
      }
      const key = `${record.pid}:${record.started}`
      known.set(key, record)
      if (record.type === 'start') starts.add(key)
    }
  }
  function living() {
    readStarts()
    for (const record of pendingSpawns.values()) {
      const current = state(record.pid)
      // Parent-side syscall evidence scopes a pending registration. Reconcile
      // only a process born at that spawn and still parented by that owner (or
      // reparented after the audited owner exited); never adopt an arbitrary PID.
      const born = current && Date.parse(current.started)
      const parent = [...known.values()].find(
        (entry) => entry.pid === record.ppid
      )
      const matchesParent =
        current &&
        (current.ppid === record.ppid ||
          (current.ppid === 1 && parent && !state(record.ppid)))
      if (
        matchesParent &&
        born >= Math.floor(record.createdAt / 1000) * 1000 - 1000 &&
        born <= record.createdAt
      ) {
        const key = `${record.pid}:${current.started}`
        if (!known.has(key)) known.set(key, { ...record, ...current })
      }
    }
    return [...known.values()].flatMap((record) => {
      const current = state(record.pid)
      return current?.started === record.started
        ? [{ ...record, pgid: current.pgid, status: current.status }]
        : []
    })
  }
  function signalOwned(records, signal) {
    const groups = new Set(records.map((record) => record.pgid))
    if (child.exitCode === null && child.signalCode === null)
      groups.add(child.pid)
    for (const pgid of groups) {
      if (!pgid || pgid <= 1 || pgid === process.pid) continue
      try {
        process.kill(-pgid, signal)
      } catch (error) {
        if (error.code !== 'ESRCH') cleanupFailures.push(String(error))
      }
    }
    // A worker may have changed groups after startup. Recheck PID identity before
    // signalling the individual process using its recorded start identity.
    for (const record of known.values()) {
      if (state(record.pid)?.started !== record.started) continue
      try {
        process.kill(record.pid, signal)
      } catch (error) {
        if (error.code !== 'ESRCH') cleanupFailures.push(String(error))
      }
    }
  }
  let stdout = ''
  let stderr = ''
  let outputExceeded = false
  let spawnError
  let timedOut = false
  let status = null
  let exitSignal = null
  const child = spawn(process.execPath, args, {
    cwd,
    env: {
      ...env,
      PACKED_PROCESS_AUDIT: audit,
      PACKED_PROCESS_TOKEN: token,
      NODE_OPTIONS: `--require=${JSON.stringify(preload)} ${env.NODE_OPTIONS ?? ''}`,
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      status = code
      exitSignal = signal
      resolve()
    })
    child.once('error', (error) => {
      spawnError = String(error)
      resolve()
    })
  })
  const closed = new Promise((resolve) => child.once('close', resolve))
  let stopForOutput
  const tooMuchOutput = new Promise((resolve) => {
    stopForOutput = resolve
  })
  function collect(stream, chunk) {
    if (stdout.length + stderr.length > 16 * 1024 * 1024) {
      outputExceeded = true
      stopForOutput()
      return
    }
    if (stream === 'stdout') stdout += chunk.toString()
    else stderr += chunk.toString()
  }
  child.stdout.on('data', (chunk) => collect('stdout', chunk))
  child.stderr.on('data', (chunk) => collect('stderr', chunk))
  let timer
  await Promise.race([
    exited,
    tooMuchOutput,
    new Promise((resolve) => {
      timer = setTimeout(() => {
        timedOut = true
        resolve()
      }, timeoutMs)
    }),
  ])
  clearTimeout(timer)
  const leaks = new Map()
  function recordLeaks(records) {
    for (const record of records) {
      if (record.pid !== child.pid && !record.status.startsWith('Z'))
        leaks.set(`${record.pid}:${record.started}`, record)
    }
  }
  try {
    const active = living()
    recordLeaks(active)
    signalOwned(active, 'SIGTERM')
    await delay(graceMs)
    const deadline = Date.now() + cleanupMs
    let quietSince
    let count = known.size
    while (true) {
      const survivors = living()
      recordLeaks(survivors)
      signalOwned(survivors, 'SIGKILL')
      if (survivors.length || known.size !== count || pendingSpawns.size)
        quietSince = undefined
      else quietSince ??= Date.now()
      count = known.size
      if (quietSince !== undefined && Date.now() - quietSince >= graceMs) break
      if (Date.now() >= deadline) {
        cleanupFailures.push(
          `Owned PIDs remain: ${survivors.map((record) => record.pid).join(',')}`
        )
        break
      }
      await delay(25)
    }
  } catch (error) {
    cleanupFailures.push(String(error))
    try {
      signalOwned([...known.values()], 'SIGKILL')
    } catch (cleanupError) {
      cleanupFailures.push(String(cleanupError))
    }
  }
  let closeTimer
  await Promise.race([
    closed,
    new Promise((resolve) => {
      closeTimer = setTimeout(() => {
        cleanupFailures.push('Owned CLI output did not close')
        child.stdout.destroy()
        child.stderr.destroy()
        resolve()
      }, cleanupMs)
    }),
  ])
  clearTimeout(closeTimer)
  const result = {
    status,
    signal: exitSignal,
    stdout,
    stderr,
    timedOut,
    outputExceeded,
    spawnError,
    leakedProcesses: [...leaks.values()],
    cleanupFailures,
    auditMissing: ![...known.values()].some(
      (record) => record.pid === child.pid
    ),
    ownedProcesses: [...known.values()],
    spawnedProcesses: [...spawns.values()],
    missingStartupRecords: [...spawns.values()].filter(
      (record) =>
        record.expectedNode &&
        ![...starts].some((key) =>
          record.started
            ? key === `${record.pid}:${record.started}`
            : key.startsWith(`${record.pid}:`)
        )
    ),
    pendingRegistrations: [...pendingSpawns.values()],
    registrationFailures: [...registrationFailures.values()],
    auditDir,
  }
  writeFileSync(join(auditDir, 'result.json'), JSON.stringify(result, null, 2))
  return result
}

export function assertOwnedNodeCompleted(result, name) {
  assert.equal(result.timedOut, false, `${name}: verifier deadline exceeded`)
  assert.equal(
    result.outputExceeded,
    false,
    `${name}: verifier output limit exceeded`
  )
  assert.equal(result.spawnError, undefined, `${name}: CLI spawn failed`)
  assert.equal(
    result.auditMissing,
    false,
    `${name}: CLI startup was not audited`
  )
  assert.deepEqual(
    result.pendingRegistrations,
    [],
    `${name}: incomplete child ownership registration`
  )
  assert.deepEqual(
    result.registrationFailures,
    [],
    `${name}: child ownership registration failed`
  )
  assert.deepEqual(
    result.missingStartupRecords,
    [],
    `${name}: missing descendant startup records`
  )
  assert.deepEqual(
    result.leakedProcesses,
    [],
    `${name}: unexpected live owned workers`
  )
  assert.deepEqual(
    result.cleanupFailures,
    [],
    `${name}: failed to reclaim owned processes`
  )
}
