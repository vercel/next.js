import { browser } from 'next/experimental/testing/browser'

async function declarationsOnly() {
  const fixture = await browser()
  /** @type {import('playwright').Locator} */
  const root = await fixture.mount('greeting', { label: 'typed' })
  root.getByRole('button')
  // @ts-expect-error Fixture identity is a registered string, not a component.
  await fixture.mount(() => null)
  // @ts-expect-error Fixture props are a property record, not a primitive.
  await fixture.mount('greeting', 42)
}
void declarationsOnly
