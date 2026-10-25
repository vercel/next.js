const { ChildProcess } = require('node:child_process')
const { appendFileSync } = require('node:fs')
const { basename } = require('node:path')
const audit = process.env.HEADLESS_MATRIX_AUDIT
if (!audit) throw new Error('Missing matrix launch audit file')
const spawn = ChildProcess.prototype.spawn
ChildProcess.prototype.spawn = function (...args) {
  const options = args[0]
  const file = basename(options.file).toLowerCase()
  const engine = file.includes('firefox')
    ? 'firefox'
    : file.includes('chrome') || file.includes('chromium')
      ? 'chromium'
      : undefined
  const result = Reflect.apply(spawn, this, args)
  if (engine && this.pid)
    appendFileSync(
      audit,
      JSON.stringify({
        pid: this.pid,
        engine,
        executable: basename(options.file),
        headless:
          file.includes('headless') ||
          options.args.some((value) => /^--?headless(?:=|$)/.test(value)),
      }) + '\n'
    )
  return result
}
