import crypto from 'crypto'
import { nextTestSetup } from 'e2e-utils'
import { nextBuild } from 'next-test-utils'

function generateMD5(text: string) {
  const hash = crypto.createHash('md5')
  hash.update(text)
  return hash.digest('hex')
}

const filePaths = [
  'app/app-page/page',
  'app/app-page/edge/page',
  'app/app-route/route',
  'app/app-route/edge/route',
  'pages/api/pages-api',
  'pages/api/pages-api/edge',
  'pages/pages-page',
  'pages/pages-page/edge',
]

describe('deterministic build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const firstBuildFileMd5Hashes: Record<string, string> = {}
  const secondBuildFileMd5Hashes: Record<string, string> = {}

  beforeAll(async () => {
    await nextBuild(__dirname, [])
    for (const file of filePaths) {
      const content = await next.readFile(`.next/server/${file}.js`)
      firstBuildFileMd5Hashes[file] = generateMD5(content)
    }

    await nextBuild(__dirname, [])
    for (const file of filePaths) {
      const content = await next.readFile(`.next/server/${file}.js`)
      secondBuildFileMd5Hashes[file] = generateMD5(content)
    }
  })

  it('should have same md5 file across build', async () => {
    expect(firstBuildFileMd5Hashes).toEqual(secondBuildFileMd5Hashes)
  })
})
