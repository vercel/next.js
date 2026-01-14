import { type NextInstance, nextTestSetup } from 'e2e-utils'
import { type ClientReferenceManifest } from 'next/dist/build/webpack/plugins/flight-manifest-plugin'

async function loadClientReferenceManifest(
  next: NextInstance,
  page: string
): Promise<ClientReferenceManifest> {
  return JSON.parse(
    (
      await next.readFile(
        `${next.distDir}/server/app${page}page_client-reference-manifest.js`
      )
    ).match(/]\s*=\s*([\S\s]+)$/)[1]
  )
}

describe('client-reference-chunking', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should use the same chunks for client references across routes', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/issue"]').click()

    expect(await browser.elementByCss('body').text()).toContain(
      'Welcome to the Issue Page'
    )

    let rootManifest = await loadClientReferenceManifest(next, '/')
    let issueManifest = await loadClientReferenceManifest(next, '/issue/')

    // These two routes have the same client component references, so these should be exactly the
    // same (especially the `chunks` field)
    expect(rootManifest.clientModules).toEqual(issueManifest.clientModules)
  })
})
