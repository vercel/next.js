import { z } from './static-lib'
import { dynamicNamespace } from './dynamic-lib'
import { escapedNamespace } from './escape-lib'

it('reads multiple static members from a namespace-valued named export', () => {
  expect(z.object()).toBe('object')
  expect(z.string()).toBe('string')
  expect(z.value).toBe('value')
})

it('keeps the full namespace for dynamic computed access', () => {
  const read = (key) => dynamicNamespace[key]
  expect(read('first')).toBe('first')
  expect(read('second')).toBe('second')
})

it('keeps the full namespace when the binding escapes', () => {
  const consume = (namespace) => Object.keys(namespace).sort()
  expect(consume(escapedNamespace)).toEqual(['alpha', 'beta'])
})
