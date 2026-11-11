import { test, aroundAll } from 'vitest'
aroundAll(async () => {
  await Promise.resolve()
  throw new Error('browser around setup failure')
})
test('blocked by failed around setup', () => {
  throw new Error('body must not execute after failed around setup')
})
