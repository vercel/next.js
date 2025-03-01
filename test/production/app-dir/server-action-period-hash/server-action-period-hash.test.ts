import { nextTestSetup } from 'e2e-utils'

async function getServerActionManifest(next) {
  const content = await next.readFile(
    '.next/server/server-reference-manifest.json'
  )
  return JSON.parse(content)
}

function compareServerActionManifestKeys(a, b, equal) {
  a = a.node
  b = b.node

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (equal) {
    expect(keysA).toEqual(keysB)
  } else {
    expect(keysA).not.toEqual(keysB)
  }
}

describe('app-dir - server-action-period-hash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should have same manifest between continuous two builds', async () => {
    await next.build()
    const firstManifest = await getServerActionManifest(next)

    await next.build()
    const secondManifest = await getServerActionManifest(next)

    compareServerActionManifestKeys(firstManifest, secondManifest, true)
  })

  it('should have different manifest between two builds with period hash', async () => {
    await next.build()
    const firstManifest = await getServerActionManifest(next)

    await next.remove('.next') // dismiss cache
    await next.build()

    const secondManifest = await getServerActionManifest(next)

    compareServerActionManifestKeys(firstManifest, secondManifest, false)
  })
})
