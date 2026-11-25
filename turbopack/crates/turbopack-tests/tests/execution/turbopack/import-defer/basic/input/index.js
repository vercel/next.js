import { log } from './log.js'
// prettier-ignore
import defer * as a from './a.js'
import './eager.js'

it('should not evaluate a deferred module (and its sync deps) before access', () => {
  expect(log).toEqual(['eager'])
})

it('should evaluate the deferred module on first property access', () => {
  expect(a.value).toBe('ab')
  expect(log).toEqual(['eager', 'b', 'a'])
})

it('should evaluate only once', () => {
  expect(a.value).toBe('ab')
  expect(a.default).toBe('default-a')
  expect(log).toEqual(['eager', 'b', 'a'])
})

it('should keep live bindings', () => {
  expect(a.counter).toBe(0)
  a.increment()
  expect(a.counter).toBe(1)
})
