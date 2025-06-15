import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import {
  getRedboxDescription,
  getRedboxLabel,
  getRedboxSource,
} from 'next-test-utils'

describe('ReactRefreshLogBox app', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })
  const isRspack = Boolean(process.env.NEXT_RSPACK)

  test('server-side only compilation errors', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.patch(
      'app/page.js',
      outdent`
        'use client'
        import myLibrary from 'my-non-existent-library'
        export async function getStaticProps() {
          return {
            props: {
              result: myLibrary()
            }
          }
        }
        export default function Hello(props) {
          return <h1>{props.result}</h1>
        }
      `
    )

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Ecmascript file had an error",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js (3:23)
       Ecmascript file had an error
       > 3 | export async function getStaticProps() {
           |                       ^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await session.assertHasRedbox()
      const redboxContent = await getRedboxDescription(browser)
      const redboxLabel = await getRedboxLabel(browser)
      const redboxSource = await getRedboxSource(browser)
      expect(redboxContent).toContain(
        '"getStaticProps" is not supported in app/'
      )
      expect(redboxLabel).toContain('Build Error')
      expect(redboxSource).toContain('./app/page.js')
      expect(redboxSource).toContain('export async function getStaticProps()')
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x "getStaticProps" is not supported in app/. Read more: https://nextjs.org/docs/app/building-your-application/data-fetching",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js
       Error:   x "getStaticProps" is not supported in app/. Read more: https://nextjs.org/docs/app/building-your-application/data-fetching
         |
          ,-[3:1]
        1 | 'use client'
        2 | import myLibrary from 'my-non-existent-library'
        3 | export async function getStaticProps() {
          :                       ^^^^^^^^^^^^^^
        4 |   return {
        5 |     props: {
        6 |       result: myLibrary()
          \`----
       Import trace for requested module:
       ./app/page.js",
         "stack": [],
       }
      `)
    }
  })
})
