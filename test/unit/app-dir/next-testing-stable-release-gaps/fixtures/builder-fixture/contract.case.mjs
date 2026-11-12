/* eslint-disable no-empty-pattern -- Fixture dependency lists use object destructuring, including an empty list. */
import { test, expect, afterAll } from 'vitest'
const trace = []
const owned = test.extend('value', async ({}, { onCleanup }) => {
  onCleanup(() => trace.push('cleanup'))
  return 42
})
owned('builder value', ({ value }) => expect(value).toBe(42))
afterAll(() => expect(trace).toEqual(['cleanup']))
