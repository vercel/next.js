import { test } from 'vitest'
let attempt = 0
test('CLI disables configured retry', () => {
  if (++attempt === 1) throw new Error('first configured attempt')
})
