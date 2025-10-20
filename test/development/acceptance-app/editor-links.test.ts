import { check, retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

async function clickSourceFile(browser: Playwright) {
  await browser.waitForElementByCss(
    '[data-with-open-in-editor-link-source-file]'
  )
  await browser
    .elementByCss('[data-with-open-in-editor-link-source-file]')
    .click()
}

async function clickImportTraceFiles(browser: Playwright) {
  await browser.waitForElementByCss(
    '[data-with-open-in-editor-link-import-trace]'
  )
  const collapsedFrameworkGroups = await browser.elementsByCss(
    '[data-with-open-in-editor-link-import-trace]'
  )
  for (const collapsedFrameworkButton of collapsedFrameworkGroups) {
    await collapsedFrameworkButton.click()
  }
}

describe('Error overlay - editor links', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('should be possible to open source file on build error', async () => {
    let editorRequestsCount = 0
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            import Component from '../index'
            export default function Page() {
              return <Component />
            }
            `,
        ],
      ]),
      undefined,
      {
        beforePageLoad(page) {
          page.route('**/__nextjs_launch-editor**', (route) => {
            editorRequestsCount += 1
            route.fulfill()
          })
        },
      }
    )
    const { session, browser } = sandbox
    await session.patch(
      'index.js',
      outdent`
        import { useState } from 'react'
        export default () => 'hello world'
      `
    )

    // Ensure the Next Logo is not loading. This is to assert that the build did stop.
    await retry(async () => {
      const loaded = await browser.eval(() => {
        return Boolean(
          [].slice
            .call(document.querySelectorAll('nextjs-portal'))
            .find((p) => {
              const badge = p.shadowRoot.querySelector('[data-next-badge]')
              // Check if badge exists and is not showing any loading status
              return (
                badge &&
                (badge.getAttribute('data-status') === 'none' ||
                  !badge.getAttribute('data-status'))
              )
            })
        )
      })
      expect(loaded).toBe(true)
    })

    await session.assertHasRedbox()
    await clickSourceFile(browser)
    await check(() => editorRequestsCount, /1/)
  })
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'opening links in import traces',
    () => {
      it('should be possible to open import trace files on RSC parse error', async () => {
        let editorRequestsCount = 0
        await using sandbox = await createSandbox(
          next,
          new Map([
            [
              'app/page.js',
              outdent`
            import Component from '../index'
            export default function Page() {
              return <Component />
            }
          `,
            ],
            ['mod1.js', "import './mod2.js'"],
            ['mod2.js', '{{{{{'],
          ]),
          undefined,
          {
            beforePageLoad(page) {
              page.route('**/__nextjs_launch-editor**', (route) => {
                editorRequestsCount += 1
                route.fulfill()
              })
            },
          }
        )
        const { session, browser } = sandbox
        await session.patch(
          'index.js',
          outdent`
        import './mod1' 
        export default () => 'hello world'
      `
        )

        await session.assertHasRedbox()
        await clickImportTraceFiles(browser)
        await check(() => editorRequestsCount, /4/)
      })

      it('should be possible to open import trace files on module not found error', async () => {
        let editorRequestsCount = 0
        await using sandbox = await createSandbox(
          next,
          new Map([
            [
              'app/page.js',
              outdent`
            import Component from '../index'
            export default function Page() {
              return <Component />
            }
          `,
            ],
            ['mod1.js', "import './mod2.js'"],
            ['mod2.js', 'import "boom"'],
          ]),
          undefined,
          {
            beforePageLoad(page) {
              page.route('**/__nextjs_launch-editor**', (route) => {
                editorRequestsCount += 1
                route.fulfill()
              })
            },
          }
        )
        const { session, browser } = sandbox
        await session.patch(
          'index.js',
          outdent`
        import './mod1' 
        export default () => 'hello world'
      `
        )

        await session.assertHasRedbox()
        await clickImportTraceFiles(browser)
        await check(() => editorRequestsCount, /3/)
      })
    }
  )
})
