import { expect, test } from 'vitest'

test('external default policy', () => {
  expect('first').toMatchSnapshot()
})
test('inline default policy', () => {
  expect('first').toMatchInlineSnapshot()
})
test('file default policy', async () => {
  await expect('first').toMatchFileSnapshot('./policy.txt')
})
