const { spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

module.exports = async function runPublicProcess(args, options) {
  const child = spawn(process.execPath, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let timer
  let failure
  let cleanupPromise
  let forceDone
  const forced = new Promise((resolve) => {
    forceDone = resolve
  })
  const closed = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }))
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  function signalGroup(pid, signal) {
    try {
      process.kill(-pid, signal)
      return true
    } catch (error) {
      if (error.code === 'ESRCH') return false
      throw error
    }
  }
  function signalProcess(pid, signal) {
    try {
      process.kill(pid, signal)
      return true
    } catch (error) {
      if (error.code === 'ESRCH') return false
      throw error
    }
  }
  function ownedPids() {
    return [...new Set([child.pid, ...options.getOwnedPids()])].filter(
      (pid) => Number.isInteger(pid) && pid > 0
    )
  }
  function cleanup() {
    return (cleanupPromise ??= (async () => {
      const groups = new Set(ownedPids())
      const deadline = Date.now() + 5000
      while (groups.size) {
        for (const pid of groups) {
          const groupAlive = signalGroup(pid, 'SIGKILL')
          const processAlive = signalProcess(pid, 'SIGKILL')
          if (!groupAlive && !processAlive) groups.delete(pid)
        }
        if (!groups.size) break
        if (Date.now() >= deadline)
          throw new Error(
            'Public CLI fixture could not close its owned process groups'
          )
        await delay(20)
      }
    })())
  }
  function force(error) {
    failure ??= error
    cleanup().then(
      () => forceDone({}),
      (cleanupError) => forceDone({ error: cleanupError })
    )
  }
  const cancel = () => {
    child.kill('SIGINT')
    timer ??= setTimeout(
      () => force(new Error('Public CLI did not close after SIGINT')),
      3000
    )
  }
  options.signal.addEventListener('abort', cancel, { once: true })
  if (options.signal.aborted) cancel()
  for (const stream of [child.stdout, child.stderr]) {
    let pending = ''
    const write = (text) => {
      try {
        options.write(text)
      } catch (error) {
        force(error)
      }
    }
    stream.on('data', (data) => {
      pending += data.toString()
      let end
      while ((end = pending.indexOf('\n')) !== -1) {
        write(pending.slice(0, end + 1))
        pending = pending.slice(end + 1)
      }
    })
    stream.on('end', () => {
      if (pending) write(pending)
    })
  }
  try {
    const result = await Promise.race([closed, forced])
    if (result.error) throw result.error
    if (failure) throw failure
    if (result.code !== 130 || result.signal)
      throw new Error(
        `Public CLI exited unexpectedly (${result.signal ?? result.code})`
      )
    if (ownedPids().some((pid) => signalGroup(pid, 0) || signalProcess(pid, 0)))
      throw new Error('Public CLI exited but left owned processes alive')
    return { ...result, pid: child.pid }
  } catch (error) {
    try {
      await cleanup()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Public CLI fixture cleanup failed'
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', cancel)
    child.stdout.destroy()
    child.stderr.destroy()
  }
}
