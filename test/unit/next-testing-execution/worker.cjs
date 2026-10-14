// This fixture verifies process ownership only; it is not a compiled Next entry.
const { spawn } = require('child_process')
const { readFileSync } = require('fs')

process.on('message', ({ type, input }) => {
  if (type === 'cancel') {
    process.send({ cleaned: true }, () => process.exit(0))
    return
  }
  if (input === 'cwd') {
    process.send({ value: readFileSync('relative-data.txt', 'utf8') }, () =>
      process.exit(0)
    )
    return
  }
  if (input.startsWith('descendant-')) {
    // Finite fallback lifetime prevents a failing regression from leaving an
    // indefinite subprocess behind. Correct teardown kills it much earlier.
    const descendant = spawn(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 4000)'],
      {
        stdio: ['ignore', process.stdout, process.stderr],
        detached: input === 'descendant-escaped',
      }
    )
    process.send({ descendant: descendant.pid }, () => {
      if (input === 'descendant-exit' || input === 'descendant-escaped')
        process.exit(0)
    })
    if (input === 'descendant-busy') while (true) {}
    return
  }
  if (input === 'busy') {
    process.send({ ready: true })
    while (true) {}
  }
  if (input === 'crash') throw new Error('worker fixture crash')
  if (input === 'wait') {
    process.send({ ready: true })
    return
  }
  global.count = (global.count || 0) + 1
  console.log('worker output')
  process.send({ count: global.count, pid: process.pid }, () => process.exit(0))
})
