import { nextTestSetup, type NextInstance } from 'e2e-utils'

async function getServerActionManifestNodeKeys(next: NextInstance) {
  const manifest = await next.readJSON(
    '.next/server/server-reference-manifest.json'
  )
  return Object.keys(manifest.node)
}

describe('app-dir - server-action-period-hash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should have same manifest between continuous two builds', async () => {
    await next.build()
    const firstActionIds = await getServerActionManifestNodeKeys(next)

    await next.build()
    const secondActionIds = await getServerActionManifestNodeKeys(next)

    expect(firstActionIds).toEqual(secondActionIds)
  })

  it('should have different manifest between two builds with period hash', async () => {
    await next.build()
    const firstActionIds = await getServerActionManifestNodeKeys(next)

    await next.remove('.next') // dismiss cache
    await next.build()

    const secondActionIds = await getServerActionManifestNodeKeys(next)

    expect(firstActionIds).not.toEqual(secondActionIds)
  })
})
