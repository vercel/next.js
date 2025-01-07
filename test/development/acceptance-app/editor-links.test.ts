import { check } from 'next-test-utils'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

async function clickSourceFile(browser: any) {
  await browser.waitForElementByCss(
    '[data-with-open-in-editor-link-source-file]'
  )
  await browser
    .elementByCss('[data-with-open-in-editor-link-source-file]')
    .click()
}

async function clickImportTraceFiles(browser: any) {
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

    await session.assertHasRedbox()
    await clickSourceFile(browser)
    await check(() => editorRequestsCount, /1/)
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)(
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
