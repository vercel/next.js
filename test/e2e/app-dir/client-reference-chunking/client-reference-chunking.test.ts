import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest } from 'next-test-utils'

// This suite reads page_client-reference-manifest.js from the local .next directory.
// Deployment mode does not expose the generated client-reference manifest.
// @force-gate !deploy
describe('client-reference-chunking', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use the same chunks for client references across routes', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/issue"]').click()

    expect(await browser.elementByCss('body').text()).toContain(
      'Welcome to the Issue Page'
    )

    let rootManifest = getClientReferenceManifest(next, '/page')
    let issueManifest = getClientReferenceManifest(next, '/issue/page')

    // These two routes have the same client component references, so these should be exactly the
    // same (especially the `chunks` field)
    expect(rootManifest.clientModules).toEqual(issueManifest.clientModules)
  })
})
