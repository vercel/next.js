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

describe('app-dir - server-action-period-hash-custom-key', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should have a different manifest if the encryption key from process env is changed', async () => {
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = 'my-secret-key1'
    await next.build()
    delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    const firstManifest = await getServerActionManifestNodeKeys(next)

    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = 'my-secret-key2'
    await next.build()
    delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    const secondManifest = await getServerActionManifestNodeKeys(next)

    expect(firstManifest).not.toEqual(secondManifest)
  })

  it('should have the same manifest if the encryption key from process env is same', async () => {
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = 'my-secret-key'
    await next.build()
    const firstManifest = await getServerActionManifest(next)

    await next.remove('.next') // dismiss cache
    await next.build() // build with the same secret key
    delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    const secondManifest = await getServerActionManifest(next)

    expect(firstManifest).toEqual(secondManifest)
  })
})
