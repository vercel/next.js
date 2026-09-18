const { appendFileSync } = require('node:fs')
const { ChildProcess, execFileSync } = require('node:child_process')
const { basename } = require('node:path')

const audit = process.env.PACKED_PROCESS_AUDIT
const token = process.env.PACKED_PROCESS_TOKEN
if (!audit || !token)
  throw new Error('Missing verifier process audit ownership')
const record = (value) =>
  appendFileSync(audit, JSON.stringify({ token, ...value }) + '\n')
function identity(pid) {
  try {
    const fields = execFileSync(
      '/bin/ps',
      ['-o', 'lstart=', '-o', 'pgid=', '-p', String(pid)],
      { encoding: 'utf8', timeout: 1000 }
    )
      .trim()
      .split(/\s+/)
    return { pgid: Number(fields.pop()), started: fields.join(' ') }
  } catch (error) {
    if (error.status === 1 && !String(error.stdout).trim()) return undefined
    throw error
  }
}
record({
  type: 'start',
  pid: process.pid,
  ppid: process.ppid,
  ...identity(process.pid),
})

// fork(), spawn() and exec() call this parent-side boundary. Register before
// returning to parent code: a detached child's delayed preload is not ownership.
const originalSpawn = ChildProcess.prototype.spawn
ChildProcess.prototype.spawn = function (...args) {
  const result = Reflect.apply(originalSpawn, this, args)
  if (this.pid) {
    const expectedNode = basename(args[0].file) === basename(process.execPath)
    record({
      type: 'spawn-pending',
      createdAt: Date.now(),
      pid: this.pid,
      ppid: process.pid,
      expectedNode,
    })
    try {
      const observed = identity(this.pid)
      record({
        type: 'spawn',
        pid: this.pid,
        ppid: process.pid,
        expectedNode,
        absent: !observed,
        ...observed,
      })
    } catch (error) {
      record({
        type: 'spawn-error',
        pid: this.pid,
        ppid: process.pid,
        error: String(error),
      })
      throw error
    }
  }
  return result
}
