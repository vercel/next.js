import * as barrelNs from './barrel.js'

it('re-exports from a CJS module through a barrel without proxy errors', () => {
  // Forces `ownKeys` + per-key `getOwnPropertyDescriptor` on the dynamic-export
  // proxy. Before the runtime fix this threw:
  //   TypeError: 'ownKeys' on proxy: trap returned extra keys but proxy
  //              target is non-extensible
  expect(Object.keys(barrelNs).sort()).toEqual([
    'AnotherThing',
    'BUTTON',
    'COLOR',
    'LEGACY_CONST',
    'PI',
    'mutableValue',
    'setMutable',
  ])
  // Spread exercises the same ownKeys + descriptor path.
  expect(Object.keys({ ...barrelNs }).sort()).toEqual(
    Object.keys(barrelNs).sort()
  )
})

it('reflects live value changes a CJS module makes to its own exports', () => {
  expect(barrelNs.mutableValue).toBe('before')
  barrelNs.setMutable('after')
  expect(barrelNs.mutableValue).toBe('after')
})

it('rejects modifying an ESM re-export through the namespace', () => {
  expect(() => {
    barrelNs.BUTTON = 'changed'
  }).toThrow()
  expect(barrelNs.BUTTON).toBe('button')
})

it('rejects modifying a CJS re-export through the namespace', () => {
  expect(() => {
    barrelNs.LEGACY_CONST = 'changed'
  }).toThrow()
  expect(barrelNs.LEGACY_CONST).toBe('I am dynamic')
})

it('rejects defineProperty and delete through the namespace', () => {
  expect(() => {
    Object.defineProperty(barrelNs, 'BUTTON', { value: 'changed' })
  }).toThrow()
  expect(() => {
    Object.defineProperty(barrelNs, 'NEW_PROP', { value: 1 })
  }).toThrow()
  expect(() => {
    delete barrelNs.LEGACY_CONST
  }).toThrow()
  expect(barrelNs.BUTTON).toBe('button')
  expect(barrelNs.LEGACY_CONST).toBe('I am dynamic')
  expect('NEW_PROP' in barrelNs).toBe(false)
})

it('supports the `in` operator for static and dynamic keys (has trap)', () => {
  expect('BUTTON' in barrelNs).toBe(true)
  expect('LEGACY_CONST' in barrelNs).toBe(true)
  expect('AnotherThing' in barrelNs).toBe(true)
  expect('mutableValue' in barrelNs).toBe(true)
  expect('DOES_NOT_EXIST' in barrelNs).toBe(false)
})

it('does not leak `default` from star-exported modules', () => {
  expect(Object.keys(barrelNs)).not.toContain('default')
  expect('default' in barrelNs).toBe(false)
})

it('keeps __esModule present but non-enumerable', () => {
  expect(barrelNs.__esModule).toBe(true)
  expect('__esModule' in barrelNs).toBe(true)
  expect(Object.keys(barrelNs)).not.toContain('__esModule')
})

it('exposes dynamic keys via getOwnPropertyDescriptor', () => {
  const desc = Object.getOwnPropertyDescriptor(barrelNs, 'LEGACY_CONST')
  expect(desc).toBeDefined()
  expect(desc.enumerable).toBe(true)
  expect(typeof desc.get).toBe('function')
})
