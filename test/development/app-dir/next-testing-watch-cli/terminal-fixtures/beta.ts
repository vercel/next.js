import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from 'vitest'

test('beta busy', async () => {
  console.log(`WATCH_FILE_PID=${process.pid}`)
  if (existsSync(join(process.cwd(), '.terminal-busy'))) {
    console.log('PTY_BUSY_STARTED')
    await new Promise(() => {})
  }
  expect(true).toBe(true)
})
