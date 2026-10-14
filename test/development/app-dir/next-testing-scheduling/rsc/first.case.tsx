import { expect, test } from 'vitest'
import { rsc } from 'next/experimental/testing/rsc'
async function Subject() {
  return <p>parallel RSC</p>
}
test('renders through Flight', async () => {
  expect(
    (
      await rsc.render(
        Subject,
        {},
        { cacheScope: 'file', url: 'http://scheduling.test/' }
      )
    ).text
  ).toBe('parallel RSC')
})
