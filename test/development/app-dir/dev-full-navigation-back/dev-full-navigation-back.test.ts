import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

describe('dev-full-navigation-back', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('shows an edit after full navigation and back navigation', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#value').text()).toBe('Value A')

    await retry(async () => {
      expect(
        await browser.eval(() => (self as any).__NEXT_DEBUG_CHANNEL_PERSISTED)
      ).toBe(true)
    })

    await browser.elementByCss('#to-about').click()
    await browser.waitForElementByCss('#about')

    const valueFile = join(next.testDir, 'app/value.ts')
    const content = await readFile(valueFile, 'utf8')
    await writeFile(valueFile, content.replace('Value A', 'Value B'))
    await waitFor(3000)

    await browser.back({ waitUntil: 'commit' })
    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe('Value B')
    })
  })
})
