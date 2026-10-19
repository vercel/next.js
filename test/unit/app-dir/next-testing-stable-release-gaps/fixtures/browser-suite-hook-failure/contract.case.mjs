import { test, beforeAll } from 'vitest'
beforeAll(async () => {
  await Promise.resolve()
  throw new Error('browser suite setup failure')
})
test('blocked by failed suite setup', () => {
  throw new Error('body must not execute after failed suite setup')
})
