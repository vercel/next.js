import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const addedPage = (value: string) => `
import { depEvalTime } from '../unmodified-module'

export default function Page() {
  return (
    <>
      <p id="value">${value}</p>
      <span id="dep-eval-time">{depEvalTime}</span>
    </>
  )
}
`

describe('hmr-entry-index', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  const itTurbopack = isTurbopack ? it : it.skip

  itTurbopack(
    'keeps aggregate HMR entries current across errors, additions, and removals',
    async () => {
      const outsideBrowser = await next.browser('/outside')
      expect(await outsideBrowser.elementByCss('#outside-value').text()).toBe(
        'outside-v1'
      )

      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')

      await next.patchFile('app/added/page.tsx', addedPage('added-v1'))

      await retry(async () => {
        const html = await next.render('/added')
        expect(html).toContain('added-v1')
      })

      await browser.loadPage(next.url + '/added')
      expect(await browser.elementByCss('#value').text()).toBe('added-v1')
      const initialDepEvalTime = await browser
        .elementByCss('#dep-eval-time')
        .text()

      await next.patchFile('app/added/page.tsx', (source) =>
        source.replace('added-v1', 'added-v2')
      )
      await retry(async () => {
        expect(await browser.elementByCss('#value').text()).toBe('added-v2')
      })
      expect(await browser.elementByCss('#dep-eval-time').text()).toBe(
        initialDepEvalTime
      )

      // Keep a Pages Router endpoint registered while App Router entries
      // update, exercising mixed-root registration and owner selection.
      await next.patchFile(
        'app/added/page.tsx',
        addedPage('added-v2-outside-registered')
      )
      await retry(async () => {
        expect(await browser.elementByCss('#value').text()).toBe(
          'added-v2-outside-registered'
        )
      })
      expect(await browser.elementByCss('#dep-eval-time').text()).toBe(
        initialDepEvalTime
      )

      // A JSX parse error emits a throwing error chunk rather than failing the
      // structural scan. Keep /added loaded through that runtime error, exercise
      // an unrelated root while the global overlay is active, then recover. The
      // Rust unit test covers owner-error propagation versus cross-root isolation.
      await next.patchFile(
        'app/added/page.tsx',
        "import { depEvalTime } from '../unmodified-module'\n\n" +
          'export default function Page() { return <p id="value">broken</span> }\n'
      )
      await retry(async () => {
        expect((await next.fetch('/added')).status).toBe(500)
      })

      await next.patchFile('app/page.tsx', (source) =>
        source.replace('hello world', 'hello index')
      )
      // Development errors are global, so this unrelated request deterministically
      // surfaces the same overlay between writes.
      expect((await next.fetch('/')).status).toBe(500)

      await next.patchFile('app/added/page.tsx', addedPage('added-v3'))
      await retry(async () => {
        expect(await browser.elementByCss('#value').text()).toBe('added-v3')
      })
      expect(await browser.elementByCss('#dep-eval-time').text()).toBe(
        initialDepEvalTime
      )

      await next.deleteFile('app/added/page.tsx')
      await retry(async () => {
        expect((await next.fetch('/added')).status).toBe(404)
      })

      await next.patchFile('app/added/page.tsx', addedPage('added-v4'))
      await retry(async () => {
        const html = await next.render('/added')
        expect(html).toContain('added-v4')
      })

      // Recreated endpoints can reuse the same stable output operation. Verify
      // it is rediscovered by requiring a subsequent incremental update.
      await browser.loadPage(next.url + '/added')
      const recreatedDepEvalTime = await browser
        .elementByCss('#dep-eval-time')
        .text()
      await next.patchFile('app/added/page.tsx', (source) =>
        source.replace('added-v4', 'added-v5')
      )
      await retry(async () => {
        expect(await browser.elementByCss('#value').text()).toBe('added-v5')
      })
      expect(await browser.elementByCss('#dep-eval-time').text()).toBe(
        recreatedDepEvalTime
      )

      await browser.loadPage(next.url + '/')
      expect(await browser.elementByCss('p').text()).toBe('hello index')

      await next.patchFile('app/page.tsx', (source) =>
        source.replace('hello index', 'hello final')
      )
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('hello final')
      })
    }
  )
})
