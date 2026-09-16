import { nextTestSetup } from 'e2e-utils'

describe('reference-tree-shaking', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Should apply removeUnusedImports tree shaking to client and server references', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('This is Server')
    expect(html).toContain('This is Dynamic')
    expect(html).toContain('This is Server Component')
    expect(html).toContain('This is Server Utility')

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

  if (process.env.IS_TURBOPACK_TEST) {
    it.each([
      ['NextDynamicEntryModule', 'unused-next-dynamic-export'],
      ['NextServerComponentModule', 'unused-next-server-component-export'],
      ['NextServerUtilityModule', 'unused-next-server-utility-export'],
    ])('tree shakes unused exports through %s', async (_module, marker) => {
      const serverChunks = await next.readFiles(
        '.next/server/chunks/ssr',
        (filename) => filename.endsWith('.js')
      )

      expect(serverChunks.some((content) => content.includes(marker))).toBe(
        false
      )
    })
  }
})
