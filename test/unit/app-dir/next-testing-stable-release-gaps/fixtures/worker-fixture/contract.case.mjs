/* eslint-disable no-empty-pattern -- Fixture dependency lists use object destructuring, including an empty list. */
import { test, expect } from 'vitest'
let created = 0
const owned = test.extend({
  value: [
    async ({}, use) => {
      await use(++created)
    },
    { scope: 'worker' },
  ],
})
owned('first', { retry: 1 }, ({ value }) => expect(value).toBe(1))
owned('second', ({ value }) => expect(value).toBe(1))
