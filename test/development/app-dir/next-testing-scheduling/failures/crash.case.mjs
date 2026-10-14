import { test } from 'vitest'
import { record } from '../support.mjs'
test('crashes a worker', () => {
  record('crash', 'crash')
  process.exit(17)
})
