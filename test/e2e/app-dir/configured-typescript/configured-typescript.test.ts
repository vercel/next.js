import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The configured module type rule is specific to Turbopack.
// @force-gate turbopack
describe('configured-typescript', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function expectServerValues(label: string) {
    const $ = await next.render$('/')
    expect($('#server-custom').text()).toBe(`${label}:42`)
    expect($('#server-control').text()).toBe('ordinary:5')
    expect($('#client-custom').text()).toBe(`${label}:43`)
    expect($('#client-control').text()).toBe('ordinary:6')
  }

  it('lowers annotations and enums and erases throwing type-only imports on the server', async () => {
    await expectServerValues('custom-before')
  })

  it('executes the configured TypeScript function in the hydrated client', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#run-custom').click()
    await retry(async () => {
      expect(await browser.elementByCss('#client-result').text()).toBe(
        'custom-before:44'
      )
      expect(await browser.elementByCss('#client-custom').text()).toBe(
        'custom-before:43'
      )
      expect(await browser.elementByCss('#client-control').text()).toBe(
        'ordinary:6'
      )
    })
  })

  // Editing source files requires the local development server, not deployment.
  // @force-gate dev
  it('updates server and hydrated client values after a custom-extension edit and restoration', async () => {
    const sourcePath = 'app/value.customts'
    const source = await next.readFile(sourcePath)
    const browser = await next.browser('/')
    await expectServerValues('custom-before')
    try {
      await next.patchFile(
        sourcePath,
        source.replace('custom-before', 'custom-after')
      )
      await retry(async () => {
        await expectServerValues('custom-after')
        expect(await browser.elementByCss('#client-custom').text()).toBe(
          'custom-after:43'
        )
        expect(await browser.elementByCss('#client-control').text()).toBe(
          'ordinary:6'
        )
      })
      await browser.elementByCss('#run-custom').click()
      await retry(async () => {
        expect(await browser.elementByCss('#client-result').text()).toBe(
          'custom-after:44'
        )
      })

      await next.patchFile(sourcePath, source)
      await retry(async () => {
        await expectServerValues('custom-before')
        expect(await browser.elementByCss('#client-custom').text()).toBe(
          'custom-before:43'
        )
        expect(await browser.elementByCss('#client-control').text()).toBe(
          'ordinary:6'
        )
      })
      await browser.elementByCss('#run-custom').click()
      await retry(async () => {
        expect(await browser.elementByCss('#client-result').text()).toBe(
          'custom-before:44'
        )
      })
    } finally {
      await next.patchFile(sourcePath, source)
    }
  })
})
