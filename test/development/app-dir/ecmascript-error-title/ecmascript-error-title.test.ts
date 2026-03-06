import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'

describe('ecmascript-error-title', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should show the specific SWC error message as title for syntax errors', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    await next.patchFile(
      'app/page.tsx',
      outdent`
        export default () => <div/
      `
    )

    if (isTurbopack) {
      // The redbox description should show the specific SWC error message
      // instead of the generic "Parsing ecmascript source code failed".
      await expect(browser).toDisplayRedbox(`
        {
          "description": "Expected '>', got '<eof>'",
          "environmentLabel": null,
          "label": "Build Error",
          "source": "./app/page.tsx (1:27)
        Expected '>', got '<eof>'
        > 1 | export default () => <div/
            |                           ^

        Parsing ecmascript source code failed",
          "stack": [],
        }
      `)
    }
  })

  it('should show the specific SWC error message as title for analysis errors', async () => {
    const browser = await next.browser('/')

    await next.patchFile(
      'app/page.tsx',
      outdent`
        import { Table } from './table'
        export default function Page() {
          return <Table />
        }
        export function Table() {
          return <p>hello</p>
        }
      `
    )

    if (isTurbopack) {
      // The redbox description should show the specific SWC error message
      // instead of the generic "Ecmascript file had an error".
      await expect(browser).toDisplayRedbox(`
        {
          "description": "the name \`Table\` is defined multiple times",
          "environmentLabel": null,
          "label": "Build Error",
          "source": "./app/page.tsx (5:17)
        the name \`Table\` is defined multiple times
        > 5 | export function Table() {
            |                 ^^^^^

        Ecmascript file had an error",
          "stack": [],
        }
      `)
    }
  })
})
