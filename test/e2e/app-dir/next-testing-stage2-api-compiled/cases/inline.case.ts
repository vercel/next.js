import { expect, test } from 'vitest'

test('inline object', () => {
  expect({ value: 'compiled inline' }).toMatchInlineSnapshot()
})

test('inline properties', () => {
  expect({ id: 123, value: 'properties' }).toMatchInlineSnapshot({
    id: expect.any(Number),
  })
})

test('inline resolved promise', async () => {
  await expect(
    Promise.resolve('resolved inline')
  ).resolves.toMatchInlineSnapshot()
})
