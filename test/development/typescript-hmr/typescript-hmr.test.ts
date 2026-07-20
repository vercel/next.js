import { nextTestSetup } from 'e2e-utils'
import { getRedboxHeader, retry } from 'next-test-utils'

describe('TypeScript HMR', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  describe('delete a page and add it back', () => {
    it('should detect the changes to typescript pages and display it', async () => {
      const browser = await next.browser('/hello')
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toMatch(/Hello World/)
      })

      const originalContent = await next.readFile('pages/hello.tsx')
      const editedContent = originalContent.replace('Hello', 'COOL page')

      if (isTurbopack) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      await next.patchFile('pages/hello.tsx', editedContent)
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toMatch(/COOL page/)
      })

      await next.patchFile('pages/hello.tsx', originalContent)
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toMatch(/Hello World/)
      })
    })
  })

  // old behavior:
  it.skip('should recover from a type error', async () => {
    const browser = await next.browser('/type-error-recover')
    const originalContent = await next.readFile('pages/type-error-recover.tsx')
    const errContent = originalContent.replace('() =>', '(): boolean =>')
    try {
      await next.patchFile('pages/type-error-recover.tsx', errContent)
      await retry(async () => {
        const header = await getRedboxHeader(browser)
        expect(header).toMatch(
          /Type 'Element' is not assignable to type 'boolean'/
        )
      })

      await next.patchFile('pages/type-error-recover.tsx', originalContent)
      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).not.toMatch(/iframe/)
      })
    } finally {
      await next.patchFile('pages/type-error-recover.tsx', originalContent)
    }
  })

  it('should ignore type errors in development', async () => {
    const browser = await next.browser('/type-error-recover')
    const originalContent = await next.readFile('pages/type-error-recover.tsx')
    const errContent = originalContent.replace(
      '() => <p>Hello world</p>',
      '(): boolean => <p>hello with error</p>'
    )
    if (isTurbopack) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    try {
      await next.patchFile('pages/type-error-recover.tsx', errContent)
      await retry(async () => {
        const text = await browser.eval('document.querySelector("p").innerText')
        expect(text).toMatch(/hello with error/)
      })
    } finally {
      await next.patchFile('pages/type-error-recover.tsx', originalContent)
    }
  })
})
