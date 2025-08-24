import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'

// FIXME: er-enable when we have a better implementation of node binary resolving
describe.skip('externalize-node-binary-browser-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should error when import node binary on browser side', async () => {
    const browser = await next.browser('/')
    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }

    expect(redbox.description).toBe('Failed to compile')
    expect(redbox.source).toMatchInlineSnapshot(`
        "./node_modules/foo-browser-import-binary/binary.node
        Error: Node.js binary module ./node_modules/foo-browser-import-binary/binary.node is not supported in the browser. Please only use the module on server side"
      `)
  })
})
