import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('_app/_document removal HMR', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should HMR when _app is removed', async () => {
    const indexContent = await next.readFile('pages/index.js')
    try {
      const browser = await next.browser('/')

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('custom _app')

      const appContent = await next.readFile('pages/_app.js')
      await next.deleteFile('pages/_app.js')

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('index page')
        expect(html).not.toContain('custom _app')
      })

      await next.patchFile(
        'pages/index.js',
        `
        export default function Page() {
          return <p>index page updated</p>
        }
      `
      )

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('index page updated')
        expect(html).not.toContain('custom _app')
      })

      await next.patchFile('pages/_app.js', appContent)

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('index page updated')
        expect(html).toContain('custom _app')
      })
    } finally {
      await next.patchFile('pages/index.js', indexContent)
    }
  })

  it('should HMR when _document is removed', async () => {
    const indexContent = await next.readFile('pages/index.js')
    try {
      const browser = await next.browser('/')

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('custom _document')

      const documentContent = await next.readFile('pages/_document.js')
      await next.deleteFile('pages/_document.js')

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('index page')
        expect(html).not.toContain('custom _document')
      })

      await next.patchFile(
        'pages/index.js',
        `
        export default function Page() {
          return <p>index page updated</p>
        }
      `
      )

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('index page updated')
        expect(html).not.toContain('custom _document')
      })

      await next.patchFile('pages/_document.js', documentContent)

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('index page updated')
        expect(html).toContain('custom _document')
      })
    } finally {
      await next.patchFile('pages/index.js', indexContent)
    }
  })
})
