/* eslint-disable no-empty-pattern -- Fixture dependency lists use object destructuring, including an empty list. */
import { test } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
export const owned = test.extend({
  value: [
    async ({}, use) => {
      // A real shared counter catches a file-lifetime implementation masquerading
      // as worker scope, even if each file is evaluated in a new process.
      const creations = Number(readFileSync('worker-creations.txt', 'utf8')) + 1
      writeFileSync('worker-creations.txt', String(creations))
      await use(creations)
    },
    { scope: 'worker' },
  ],
})
