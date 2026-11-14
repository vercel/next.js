import { z } from './static-lib'
import { dynamicNamespace } from './dynamic-lib'
import { escapedNamespace } from './escape-lib'
import { readUsed, counter, increment } from './fragment-bindings'
import './fragment-evaluation'
import { events } from './fragment-events'
import { readState } from './fragment-initialization'
import './fragment-initialization/unused'

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

it('only exports the named bindings read by other fragments', () => {
  expect(readUsed()).toBe('used')
  expect(counter).toBe(0)
  increment()
  expect(counter).toBe(1)

  const factories = Array.from(__turbopack_modules__)
    .filter(([id]) => id.includes('/input/fragment-bindings.js'))
    .map(([, factory]) => factory.toString())
  expect(factories.length).toBeGreaterThan(0)
  const source = factories.join('\n')
  expect(source).not.toMatch(/\(\)\s*=>\s*unusedBinding\b/)
  expect(source).not.toContain('UNUSED_FRAGMENT_FUNCTION')
})

it('preserves evaluation order without exporting evaluation-only bindings', () => {
  expect(events).toEqual(['first', 'second'])

  const factories = Array.from(__turbopack_modules__)
    .filter(([id]) => id.includes('/input/fragment-evaluation.js'))
    .map(([, factory]) => factory.toString())
  expect(factories.length).toBeGreaterThan(0)
  const source = factories.join('\n')
  expect(source).not.toMatch(/\(\)\s*=>\s*evaluationOnly\b/)
  expect(source).not.toContain('UNUSED_EVALUATION_FUNCTION')
})

it('preserves internal initialization in side-effect-free packages without exporting its bindings', () => {
  expect(readState()).toBe('ready')

  const factories = Array.from(__turbopack_modules__)
    .filter(([id]) => id.includes('/input/fragment-initialization/index.js'))
    .map(([, factory]) => factory.toString())
  expect(factories.length).toBeGreaterThan(0)
  const source = factories.join('\n')
  expect(source).not.toMatch(/\(\)\s*=>\s*initialization\b/)
  expect(source).not.toContain('UNUSED_SIDE_EFFECT_FREE_INITIALIZATION')
})
