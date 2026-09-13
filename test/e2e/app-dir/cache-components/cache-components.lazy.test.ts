import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'

describe('cache-components', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should load correctly', async () => {
    const browser = await next.browser('/lazy')
    expect(await browser.elementByCss('p').text()).toBe('Client Component')
  })

  if (isNextDev) {
    it('should still work after changes', async () => {
      {
        const browser = await next.browser('/lazy')
        expect(await browser.elementByCss('p').text()).toBe('Client Component')
        expect(await browser.elementByCss('section').text()).toBe(
          'Unrelated Component'
        )

        await next.patchFile(
          'app/lazy/unrelated.tsx',
          (content) =>
            content.replace(
              'Unrelated Component',
              'Unrelated Changed Component'
            ),
          async () => {
            await retry(async () => {
              expect(await browser.elementByCss('section').text()).toBe(
                'Unrelated Changed Component'
              )
              expect(await browser.elementByCss('p').text()).toBe(
                'Client Component'
              )
              assertNoRedbox(browser)
            })

            {
              const browser = await next.browser('/lazy')
              expect(await browser.elementByCss('p').text()).toBe(
                'Client Component'
              )
              expect(await browser.elementByCss('section').text()).toBe(
                'Unrelated Changed Component'
              )
              assertNoRedbox(browser)
            }
          }
        )
      }

      {
        const browser = await next.browser('/lazy')
        expect(await browser.elementByCss('p').text()).toBe('Client Component')
        expect(await browser.elementByCss('section').text()).toBe(
          'Unrelated Component'
        )
        assertNoRedbox(browser)
      }
    })
  }
})
