import { test } from 'vitest'
let startA, startB
const a = new Promise((r) => (startA = r)),
  b = new Promise((r) => (startB = r))
test.concurrent('first concurrent owner', async ({ expect }) => {
  startA()
  await b
  expect.assertions(1)
  expect('a').toBe('a')
})
test.concurrent('second concurrent owner', async ({ expect }) => {
  startB()
  await a
  expect.assertions(2)
  expect('b').toBe('b')
  expect('b2').toBe('b2')
})
