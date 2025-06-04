import { nextTestSetup, type NextInstance } from 'e2e-utils'

async function getServerActionManifestNodeKeys(next: NextInstance) {
  const manifest = await next.readJSON(
    '.next/server/server-reference-manifest.json'
  )
  return Object.keys(manifest.node)
}

describe('app-dir - server-action-period-hash-custom-key', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should have a different manifest if the encryption key from process env is changed', async () => {
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = 'my-secret-key1'
    await next.build()
    delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    const firstActionIds = await getServerActionManifestNodeKeys(next)

    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = 'my-secret-key2'
    await next.build()
    delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    const secondActionIds = await getServerActionManifestNodeKeys(next)

    expect(firstActionIds).not.toEqual(secondActionIds)
  })

  it('should have the same manifest if the encryption key from process env is same', async () => {
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = 'my-secret-key'
    await next.build()
    const firstActionIds = await getServerActionManifestNodeKeys(next)

    await next.remove('.next') // dismiss cache
    await next.build() // build with the same secret key
    delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    const secondActionIds = await getServerActionManifestNodeKeys(next)

    expect(firstActionIds).toEqual(secondActionIds)
  })
})
