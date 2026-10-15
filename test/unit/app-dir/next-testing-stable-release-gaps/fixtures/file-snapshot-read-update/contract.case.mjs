import { test, expect } from 'vitest'
test('updates existing arbitrary file snapshot', async () => {
  await expect('new file snapshot\nline two').toMatchFileSnapshot(
    './actual.txt'
  )
})
