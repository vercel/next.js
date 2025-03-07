import { nextTestSetup } from 'e2e-utils'

async function getServerActionManifest(next) {
  const content = await next.readFile(
    '.next/server/server-reference-manifest.json'
  )
  return JSON.parse(content)
}

async function getServerActionManifestNodeKeys(next) {
  const manifest = await getServerActionManifest(next)
  return Object.keys(manifest.node)
}

describe('app-dir - server-action-period-hash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should have same manifest between continuous two builds', async () => {
    await next.build()
    const firstManifest = await getServerActionManifestNodeKeys(next)

    await next.build()
    const secondManifest = await getServerActionManifestNodeKeys(next)

    expect(firstManifest).toEqual(secondManifest)
  })

  it('should have different manifest between two builds with period hash', async () => {
    await next.build()
    const firstManifest = await getServerActionManifestNodeKeys(next)

    await next.remove('.next') // dismiss cache
    await next.build()

    const secondManifest = await getServerActionManifestNodeKeys(next)

    expect(firstManifest).not.toEqual(secondManifest)
  })
})
