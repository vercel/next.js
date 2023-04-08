import { check } from 'next-test-utils'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'
import { sandbox } from './helpers'

async function clickEditorLinks(browser: any) {
  await browser.waitForElementByCss('[data-with-open-in-editor-link]')
  const collapsedFrameworkGroups = await browser.elementsByCss(
    '[data-with-open-in-editor-link]'
  )
  for (const collapsedFrameworkButton of collapsedFrameworkGroups) {
    await collapsedFrameworkButton.click()
  }
}

createNextDescribe(
  'Error overlay - editor links',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    it('should be possible to open files on RSC build error', async () => {
      let editorRequestsCount = 0
      const { session, browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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

      await session.patch(
        'index.js',
        `import { useState } from 'react'
        export default () => 'hello world'`
      )

      expect(await session.hasRedbox(true)).toBe(true)
      await clickEditorLinks(browser)
      await check(() => editorRequestsCount, /2/)

      await cleanup()
    })

    it('should be possible to open files on RSC parse error', async () => {
      let editorRequestsCount = 0
      const { session, browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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

      await session.patch(
        'index.js',
        `import './mod1' 
          export default () => 'hello world'`
      )

      expect(await session.hasRedbox(true)).toBe(true)
      await clickEditorLinks(browser)
      await check(() => editorRequestsCount, /4/)

      await cleanup()
    })

    it('should be possible to open files on module not found error', async () => {
      let editorRequestsCount = 0
      const { session, browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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

      await session.patch(
        'index.js',
        `import './mod1' 
            export default () => 'hello world'`
      )

      expect(await session.hasRedbox(true)).toBe(true)
      await clickEditorLinks(browser)
      await check(() => editorRequestsCount, /3/)

      await cleanup()
    })
  }
)
