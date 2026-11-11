import { expect, test } from 'vitest'
import { rsc } from 'next/experimental/testing/rsc'
async function Subject() {
  return <p>isolated RSC</p>
}
test('renders a separate subtree', async () => {
  expect(
    (
      await rsc.render(
        Subject,
        {},
        { cacheScope: 'file', url: 'http://scheduling.test/' }
      )
    ).text
  ).toBe('isolated RSC')
})
