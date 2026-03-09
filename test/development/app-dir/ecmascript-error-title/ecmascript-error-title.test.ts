import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  getRedboxSource,
  waitForRedbox,
} from 'next-test-utils'
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
      await waitForRedbox(browser)
      const description = await getRedboxDescription(browser)
      expect(description).toBe("Expected '>', got '<eof>'")

      const source = await getRedboxSource(browser)
      expect(source).toContain("Expected '>', got '<eof>'")
      expect(source).toContain('> 1 | export default () => <div/')
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
      await waitForRedbox(browser)
      const description = await getRedboxDescription(browser)
      expect(description).toBe('the name `Table` is defined multiple times')

      const source = await getRedboxSource(browser)
      expect(source).toContain('the name `Table` is defined multiple times')
      expect(source).toContain('> 5 | export function Table() {')
    }
  })
})
