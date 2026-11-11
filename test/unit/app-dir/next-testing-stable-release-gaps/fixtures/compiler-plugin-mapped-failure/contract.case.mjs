import { test, expect } from 'vitest'
import { failFromSubject, transformStages } from './subject.mjs'
test('ordered compiler transforms retain the authored throw frame', () => {
  expect(transformStages).toBe('second')
  failFromSubject()
})
