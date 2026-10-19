import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

// A proxy that only imports `next/server` must not pull in the app-page runtime
// or React. Both are expensive to load on a cold start and were previously
// reachable through `connection()` -> `dynamic-rendering`.
describe('proxy-no-page-runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should run the proxy', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-from-proxy')).toBe('1')
  })

  it('should not trace the app-page runtime or React into the proxy', async () => {
    const nft = JSON.parse(
      await fs.promises.readFile(
        path.join(next.testDir, '.next/server/middleware.js.nft.json'),
        'utf8'
      )
    )
    const files: string[] = nft.files
    expect(files.filter((file) => /app-page.*\.runtime\./.test(file))).toEqual(
      []
    )
    expect(files.filter((file) => /node_modules\/react\//.test(file))).toEqual(
      []
    )
  })
})
