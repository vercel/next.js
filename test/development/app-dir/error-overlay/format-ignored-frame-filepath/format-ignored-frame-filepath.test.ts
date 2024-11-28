import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, toggleCollapseCallStackFrames } from 'next-test-utils'
import { type BrowserInterface } from 'next-webdriver'

async function getIgnoredFrameFilepaths(browser: BrowserInterface) {
  await assertHasRedbox(browser)
  await toggleCollapseCallStackFrames(browser)

  const elements = await browser.elementsByCss('[data-file-path]')
  const framesFilePaths = await Promise.all(
    elements.map(async (el) => {
      const line = await el.innerText()
      // Remove the line number
      return line.replace(/\(\d+:\d+\)?$/, '').trim()
    })
  )
  return framesFilePaths.join('\n')
}

describe('format-ignored-frame-filepath', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      swr: '2.2.5',
    },
  })

  it('should normalize ignored node_modules filepath in app router', async () => {
    const browser = await next.browser('/client')

    const ignoredFrameFilepaths = await getIgnoredFrameFilepaths(browser)
    if (process.env.TURBOPACK) {
      expect(ignoredFrameFilepaths).toMatchInlineSnapshot(`
        "node_modules/swr/dist/_internal/index.mjs
        node_modules/swr/dist/core/index.mjs
        node_modules/swr/dist/core/index.mjs
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js"
      `)
    } else {
      expect(ignoredFrameFilepaths).toMatchInlineSnapshot(`
        "node_modules/swr/dist/_internal/index.mjs
        node_modules/swr/dist/core/index.mjs
        node_modules/swr/dist/core/index.mjs
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
        node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js"
      `)
    }
  })

  it('should normalize ignored node_modules filepath in pages router', async () => {
    const browser = await next.browser('/pages')

    const ignoredFrameFilepaths = await getIgnoredFrameFilepaths(browser)
    if (process.env.TURBOPACK) {
      expect(ignoredFrameFilepaths).toMatchInlineSnapshot(`
        "node_modules/swr/dist/_internal/index.mjs
        node_modules/swr/dist/core/index.mjs
        node_modules/swr/dist/core/index.mjs
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/scheduler/cjs/scheduler.development.js"
      `)
    } else {
      expect(ignoredFrameFilepaths).toMatchInlineSnapshot(`
        "node_modules/swr/dist/_internal/index.mjs
        node_modules/swr/dist/core/index.mjs
        node_modules/swr/dist/core/index.mjs
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/react-dom/cjs/react-dom-client.development.js
        node_modules/scheduler/cjs/scheduler.development.js"
      `)
    }
  })
})
