/* eslint-disable no-empty-pattern -- Fixture dependency lists use object destructuring, including an empty list. */
import { test, expect } from 'vitest'
const owned = test.extend({
  value: [async ({}, use) => use(42), { scope: 'file' }],
})
owned.beforeAll(({ value }) => expect(value).toBe(42))
owned('body', ({ value }) => expect(value).toBe(42))
