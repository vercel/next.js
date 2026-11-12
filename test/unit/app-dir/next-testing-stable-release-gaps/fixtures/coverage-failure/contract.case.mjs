import { test } from 'vitest'
import { choose } from './subject.mjs'
test('failure coverage', () => {
  choose(true)
  throw new Error('intentional covered failure')
})
