import { nextTestSetup } from 'e2e-utils'

describe('reference-tree-shaking', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Should apply removeUnusedImports tree shaking to client and server references', async () => {
    const res = await next.fetch('/')
    expect(await res.text()).toContain('This is Server')

    // Only Turbopack applies inner graph tree shaking here
    if (process.env.IS_TURBOPACK_TEST) {
      const serverReferences = await next.readFile(
        '.next/server/server-reference-manifest.json'
      )
      expect(serverReferences).not.toContain('library/action.js')

      const clientReferences = await next.readFile(
        '.next/server/app/page_client-reference-manifest.js'
      )
      expect(clientReferences).not.toContain('library/client.js')
    }
  })
})
