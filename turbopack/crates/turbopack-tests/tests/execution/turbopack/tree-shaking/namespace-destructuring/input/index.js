import * as chain from './d1-lib'
import * as nested from './d2-lib'
import { a as namedNamespace } from './d3-lib'
import * as defaults from './d4-lib'
import * as rest from './d5-lib'
import * as computed from './d6-lib'
import * as literalKey from './d7-lib'
import * as nestedRest from './d8-lib'
import * as nestedComputed from './d9-lib'

it('narrows destructuring of a static member chain', () => {
  const { leaf, siblingUsed } = chain.a.b
  expect(leaf).toBe('leaf')
  expect(siblingUsed).toBe(false)
})

it('narrows nested object patterns on a namespace import', () => {
  const {
    a: {
      b: { leaf: renamedLeaf, siblingUsed },
    },
  } = nested
  expect(renamedLeaf).toBe('leaf')
  expect(siblingUsed).toBe(false)
})

it('narrows destructuring of a namespace-valued named import', () => {
  const { b, aUnusedInfo } = namedNamespace
  expect(b.leaf).toBe('leaf')
  expect(aUnusedInfo).toBe(false)
})

it('treats a default value as a read of that export', () => {
  const { leaf = 'fallback', siblingUsed } = defaults.a
  expect(leaf).toBe('leaf')
  expect(siblingUsed).toBe(false)
})

it('keeps the whole namespace for a rest element', () => {
  const { leaf, ...others } = rest.a
  expect(leaf).toBe('leaf')
  expect(others.sibling).toBe('sibling')
  expect(rest.a.siblingUsed).toBe(true)
})

it('keeps the whole namespace for a computed key', () => {
  const key = ['sib', 'ling'].join('')
  const { [key]: value } = computed.a
  expect(value).toBe('sibling')
  expect(computed.a.siblingUsed).toBe(true)
})

it('narrows a computed string-literal key', () => {
  const { ['leaf']: value, siblingUsed } = literalKey.a
  expect(value).toBe('leaf')
  expect(siblingUsed).toBe(false)
})

it('keeps the whole namespace for a nested rest element at that level only', () => {
  const {
    a: {
      b: { leaf, ...others },
      aUnusedInfo,
    },
  } = nestedRest
  expect(leaf).toBe('leaf')
  expect(others.sibling).toBe('sibling')
  expect(nestedRest.a.b.siblingUsed).toBe(true)
  expect(aUnusedInfo).toBe(false)
})

it('keeps the whole namespace for a nested computed key at that level only', () => {
  const key = ['sib', 'ling'].join('')
  const {
    a: {
      b: { [key]: value },
      aUnusedInfo,
    },
  } = nestedComputed
  expect(value).toBe('sibling')
  expect(nestedComputed.a.b.siblingUsed).toBe(true)
  expect(aUnusedInfo).toBe(false)
})
