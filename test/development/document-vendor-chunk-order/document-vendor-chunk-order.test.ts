import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('document-vendor-chunk-order', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // `pages/_document` loads `dep-a` and `dep-b` from separate vendor chunks.
  // Compiling the API route makes `dep-a` shared by more entries, which used to
  // change the order of those chunks in `_document`'s output and trigger a
  // "_document has changed" full reload of every open page.
  it('should not reload the page when a new server entry is compiled', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#message').text()).toBe('hello world')
    const timeOrigin = await browser.eval('performance.timeOrigin')

    const res = await next.fetch('/api/hello')
    expect(await res.json()).toEqual({ dep: 'dep-a' })

    // Edit a component of the open page. Fast Refresh applies it once the
    // browser has processed every message sent before, including a reload.
    const content = await next.readFile('components/message.js')
    await next.patchFile(
      'components/message.js',
      content.replace('hello world', 'hello again')
    )
    await retry(async () => {
      expect(await browser.elementByCss('#message').text()).toBe('hello again')
    })

    expect(await browser.eval('performance.timeOrigin')).toEqual(timeOrigin)
  })
})
