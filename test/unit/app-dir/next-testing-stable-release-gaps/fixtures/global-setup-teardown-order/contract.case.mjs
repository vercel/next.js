import { appendFile } from 'node:fs/promises'
import { test, expect, inject } from 'vitest'
test('setup surrounds the run', async () => {
  expect(inject('setupValue')).toBe(42)
  await appendFile('lifecycle.txt', 'body\n')
})
