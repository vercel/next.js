import { spawn } from 'node:child_process'
import { test } from 'vitest'
import { record } from '../support.mjs'
test('reclaims workers after compiler crash', () => {
  const descendant = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    { stdio: 'ignore' }
  )
  record('compiler-crash', 'compiler-crash', { descendant: descendant.pid })
  process.kill(Number(process.env.NEXT_SCHEDULING_COMPILER_PID), 'SIGKILL')
  while (true) {}
})
