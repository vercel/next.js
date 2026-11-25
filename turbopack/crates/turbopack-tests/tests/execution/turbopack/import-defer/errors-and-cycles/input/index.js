import { log } from './log.js'
// prettier-ignore
import defer * as throwing from './throwing.js'
import { readFromCycle } from './cycle-a.js'

it('should throw evaluation errors on access, not at import time', () => {
  expect(log).not.toContain('throwing')
  expect(() => throwing.value).toThrow('evaluation failed')
  expect(log).toContain('throwing')
})

it('should rethrow the evaluation error on every access', () => {
  expect(() => throwing.value).toThrow('evaluation failed')
})

it('should handle deferred imports in cycles', () => {
  expect(readFromCycle()).toBe('b:a')
})
