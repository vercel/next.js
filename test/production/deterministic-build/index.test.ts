import crypto from 'crypto'
import { NextInstance, nextTestSetup } from 'e2e-utils'

type Md5Hash = string & { __brand: 'Md5Hash' }

type Record = [filePath: string, hash: string, content: string]

interface RouteFileHashRecords {
  [key: string]: Record[]
}

function generateMD5(text: string): Md5Hash {
  const hash = crypto.createHash('md5')
  hash.update(text)
  return hash.digest('hex') as Md5Hash
}

function getNodeFileHashes(next: NextInstance): RouteFileHashRecords {
  const nodeBuildFileMd5Hashes: RouteFileHashRecords = {}
  for (const file of nodeFilePaths) {
    const content = next.readFileSync(`.next/server/${file}.js`)
    const md5 = generateMD5(content)
    nodeBuildFileMd5Hashes[file] = [[file, md5, content]]
  }

  return nodeBuildFileMd5Hashes
}

const nodeFilePaths = [
  'app/app-page/page',
  'app/app-route/route',
  'pages/api/pages-api',
  'pages/pages-page',
]

function getEdgeRouteFileHashes(next: NextInstance): RouteFileHashRecords {
  const manifest: any = JSON.parse(
    next.readFileSync('.next/server/middleware-manifest.json')
  )
  const routeKeys = Object.keys(manifest.functions)
  const hashMap: RouteFileHashRecords = {}
  for (const route of routeKeys) {
    const files: string[] = manifest.functions[route].files

    const hashes: Record[] = []
    for (const filePath of files) {
      const content = next.readFileSync(`.next/${filePath}`)
      hashes.push([filePath, generateMD5(content), content])
    }
    hashMap[route] = hashes
  }
  return hashMap
}

interface Runs {
  run1: RouteFileHashRecords
  run2: RouteFileHashRecords
}

describe('deterministic build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const edgeBuildFileMd5Hashes: Runs = {
    run1: {},
    run2: {},
  }

  const nodeBuildFileMd5Hashes: Runs = {
    run1: {},
    run2: {},
  }

  beforeAll(async () => {
    // First build
    await next.build()
    edgeBuildFileMd5Hashes.run1 = getEdgeRouteFileHashes(next)
    nodeBuildFileMd5Hashes.run1 = getNodeFileHashes(next)

    // Second build
    await next.build()
    edgeBuildFileMd5Hashes.run2 = getEdgeRouteFileHashes(next)
    nodeBuildFileMd5Hashes.run2 = getNodeFileHashes(next)
  })

  it('should have same md5 file across build', async () => {
    expect(edgeBuildFileMd5Hashes.run1).toEqual(edgeBuildFileMd5Hashes.run2)
    expect(nodeBuildFileMd5Hashes.run1).toEqual(nodeBuildFileMd5Hashes.run2)
  })
})
