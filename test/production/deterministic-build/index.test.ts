import crypto from 'crypto'
import { NextInstance, nextTestSetup } from 'e2e-utils'

function generateMD5(text: string) {
  const hash = crypto.createHash('md5')
  hash.update(text)
  return hash.digest('hex')
}

const nodeFilePaths = [
  'app/app-page/page',
  'app/app-route/route',
  'pages/api/pages-api',
  'pages/pages-page',
]

async function getEdgeRouteFilesFromManifest(next: NextInstance) {
  const manifest: any = JSON.parse(
    await next.readFile('.next/server/middleware-manifest.json')
  )
  const routeKeys = Object.keys(manifest.functions)
  const md5Map: Record<string, string[]> = {}
  for (const route of routeKeys) {
    const files: string[] = manifest.functions[route].files
    const filesMd5Promises = files.map(async (filePath: string) => {
      const content = await next.readFile(`.next/${filePath}`)
      return generateMD5(content)
    })
    const md5s = await Promise.all(filesMd5Promises)
    md5Map[route] = md5s
  }
  return md5Map
}

describe('deterministic build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // Edge - { [route]: [file md5s] }
  const edgeBuildFileMd5Hashes: Record<string, string[]>[] = []
  // Node - { [route]: page.js or route.js md5 }
  const nodeBuildFileMd5Hashes: Record<string, string>[] = [{}, {}]

  beforeAll(async () => {
    // First build
    await next.build()
    edgeBuildFileMd5Hashes.push(await getEdgeRouteFilesFromManifest(next))
    for (const file of nodeFilePaths) {
      const content = await next.readFile(`.next/server/${file}.js`)
      nodeBuildFileMd5Hashes[0][file] = generateMD5(content)
    }

    // Second build
    await next.build()
    edgeBuildFileMd5Hashes.push(await getEdgeRouteFilesFromManifest(next))
    for (const file of nodeFilePaths) {
      const content = await next.readFile(`.next/server/${file}.js`)
      nodeBuildFileMd5Hashes[1][file] = generateMD5(content)
    }
  })

  it('should have same md5 file across build', async () => {
    expect(edgeBuildFileMd5Hashes[0]).toEqual(edgeBuildFileMd5Hashes[1])
    expect(nodeBuildFileMd5Hashes[0]).toEqual(nodeBuildFileMd5Hashes[1])
  })
})
