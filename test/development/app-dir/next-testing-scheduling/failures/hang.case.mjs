import { spawn } from 'node:child_process'
import { test } from 'vitest'
import { record } from '../support.mjs'
test('owns an unresponsive worker and its descendant', () => {
  const descendant = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    { stdio: 'ignore' }
  )
  record('hang', 'hang', { descendant: descendant.pid })
  while (true) {}
})
