import { test, expect } from 'vitest'
test('ordinary and primitive thrown values have inline snapshots', () => {
  expect(() => {
    throw new Error('inline saved error')
  }).toThrowErrorMatchingInlineSnapshot()
  expect(() => {
    // eslint-disable-next-line no-throw-literal -- The unchanged-body contract verifies primitive thrown snapshot values.
    throw 'primitive error'
  }).toThrowErrorMatchingInlineSnapshot()
})
test('promise errors retain their original inline callsite', async () => {
  await expect(
    Promise.reject(new Error('rejected error'))
  ).rejects.toThrowErrorMatchingInlineSnapshot()
  await expect(
    Promise.resolve(new Error('resolved error'))
  ).resolves.toThrowErrorMatchingSnapshot('resolved hint')
})
