import { test, expect } from 'vitest'
import * as aliased from '@source'
import * as direct from './subject.mjs'
import { value as extra } from '@source-extra'
import { value as nested } from '@folder/value.mjs'
test('Next resolves string aliases and real module namespace identities', async () => {
  expect(aliased.value).toBe(42)
  expect(extra).toBe(7)
  expect(nested).toBe(19)
  expect(aliased).toBe(direct)
  expect(await import('@source')).toBe(direct)
  expect((await import('@folder/value.mjs?subpath')).value).toBe(19)
})
