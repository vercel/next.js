import glob from 'glob'
import http from 'http'
import fs from 'fs-extra'
import { join } from 'path'
import { FileRef, NextInstance, createNext } from 'e2e-utils'
import {
  retry,
  killApp,
  findPort,
  fetchViaHTTP,
  initNextServerScript,
} from 'next-test-utils'

describe('fetch-cache', () => {
  let next: NextInstance
  let appPort: any
  let cliOuptut = ''
  let nextInstance: any
  let fetchGetReqIndex = 0
  let revalidateReqIndex = 0
  let fetchGetShouldError = false
  let fetchCacheServer: http.Server
  let fetchCacheRequests: Array<{
    url: string
    method: string
    headers: Record<string, string | string[]>
  }> = []
  let fetchCacheEnv: Record<string, string> = {
    SUSPENSE_CACHE_PROTO: 'http',
  }

  const setupNext = async ({
    nextEnv,
    minimalMode,
  }: {
    nextEnv?: boolean
    minimalMode?: boolean
  }) => {
    // test build against environment with next support
    process.env.NOW_BUILDER = nextEnv ? '1' : ''

    next = await createNext({
      files: {
        app: new FileRef(join(__dirname, 'app')),
      },
      nextConfig: {
        eslint: {
          ignoreDuringBuilds: true,
        },
        output: 'standalone',
      },
    })
    await next.stop()

    await fs.move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )
    for (const file of await fs.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fs.remove(join(next.testDir, file))
        console.log('removed', file)
      }
    }
    const files = glob.sync('**/*', {
      cwd: join(next.testDir, 'standalone/.next/server/pages'),
      dot: true,
    })

    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.html')) {
        await fs.remove(join(next.testDir, '.next/server', file))
      }
    }

    const testServer = join(next.testDir, 'standalone/server.js')
    await fs.writeFile(
      testServer,
      (await fs.readFile(testServer, 'utf8')).replace(
        'port:',
        `minimalMode: ${minimalMode},port:`
      )
    )
    appPort = await findPort()
    nextInstance = await initNextServerScript(
      testServer,
      /- Local:/,
      {
        ...process.env,
        ...fetchCacheEnv,
        PORT: appPort,
      },
      undefined,
      {
        cwd: next.testDir,
        onStderr(data) {
          cliOuptut += data
        },
        onStdout(data) {
          cliOuptut += data
        },
      }
    )
  }

  beforeAll(async () => {
    fetchGetReqIndex = 0
    revalidateReqIndex = 0
    fetchCacheRequests = []
    fetchGetShouldError = false
    fetchCacheServer = http.createServer((req, res) => {
      console.log(`fetch cache request ${req.url} ${req.method}`, req.headers)
      const parsedUrl = new URL(req.url || '/', 'http://n')

      fetchCacheRequests.push({
        url: req.url,
        method: req.method?.toLowerCase(),
        headers: req.headers,
      })

      if (parsedUrl.pathname === '/v1/suspense-cache/revalidate') {
        revalidateReqIndex += 1
        // timeout unless it's 3rd retry
        const shouldTimeout = revalidateReqIndex % 3 !== 0

        if (shouldTimeout) {
          console.log('not responding for', req.url, { revalidateReqIndex })
          return
        }
        res.statusCode = 200
        res.end(`revalidated ${parsedUrl.searchParams.get('tags')}`)
        return
      }
      const keyMatches = parsedUrl.pathname.match(
        /\/v1\/suspense-cache\/(.*?)\/?$/
      )
      const key = keyMatches?.[0]

      if (key) {
        const type = req.method?.toLowerCase()
        console.log(`got ${type} for ${key}`)

        if (type === 'get') {
          fetchGetReqIndex += 1

          if (fetchGetShouldError) {
            res.statusCode = 500
            res.end('internal server error')
            return
          }
        }
        res.statusCode = type === 'post' ? 200 : 404
        res.end(`${type} for ${key}`)
        return
      }
      res.statusCode = 404
      res.end('not found')
    })
    await new Promise<void>(async (resolve) => {
      let fetchCachePort = await findPort()
      fetchCacheServer.listen(fetchCachePort, () => {
        fetchCacheEnv['SUSPENSE_CACHE_URL'] = `[::]:${fetchCachePort}`
        console.log(
          `Started fetch cache server at http://${fetchCacheEnv['SUSPENSE_CACHE_URL']}`
        )
        resolve()
      })
    })
    await setupNext({ nextEnv: true, minimalMode: true })
  })
  afterAll(async () => {
    await next.destroy()
    if (fetchCacheServer) fetchCacheServer.close()
    if (nextInstance) await killApp(nextInstance)
  })

  it('should have correct fetchUrl field for fetches and unstable_cache', async () => {
    const res = await fetchViaHTTP(appPort, '/?myKey=myValue')
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('hello world')

    const fetchUrlHeader = 'x-vercel-cache-item-name'
    const fetchTagsHeader = 'x-vercel-cache-tags'
    const fetchSoftTagsHeader = 'x-next-cache-soft-tags'
    const unstableCacheSet = fetchCacheRequests.find((item) => {
      return (
        item.method === 'get' &&
        item.headers[fetchUrlHeader]?.includes('unstable_cache')
      )
    })
    const fetchSet = fetchCacheRequests.find((item) => {
      return (
        item.method === 'get' &&
        item.headers[fetchUrlHeader]?.includes('next-data-api-endpoint')
      )
    })

    expect(unstableCacheSet.headers[fetchUrlHeader]).toMatch(
      /unstable_cache \/\?myKey=myValue .*?/
    )
    expect(unstableCacheSet.headers[fetchTagsHeader]).toBe('thankyounext')
    expect(unstableCacheSet.headers[fetchSoftTagsHeader]).toBe(
      '_N_T_/layout,_N_T_/page,_N_T_/'
    )
    expect(fetchSet.headers[fetchUrlHeader]).toBe(
      'https://next-data-api-endpoint.vercel.app/api/random?a=b'
    )
    expect(fetchSet.headers[fetchSoftTagsHeader]).toBe(
      '_N_T_/layout,_N_T_/page,_N_T_/'
    )
    expect(fetchSet.headers[fetchTagsHeader]).toBe('thankyounext')
  })

  it('should retry 3 times when revalidate times out', async () => {
    await fetchViaHTTP(appPort, '/api/revalidate')

    await retry(() => {
      expect(revalidateReqIndex).toBe(3)
    })
    expect(cliOuptut).not.toContain('Failed to revalidate')
    expect(cliOuptut).not.toContain('Error')
  })

  it('should not retry for failed fetch-cache GET', async () => {
    fetchGetShouldError = true
    const fetchGetReqIndexStart = fetchGetReqIndex

    try {
      await fetchViaHTTP(appPort, '/api/revalidate')
      const res = await fetchViaHTTP(appPort, '/')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('hello world')
      expect(fetchGetReqIndex).toBe(fetchGetReqIndexStart + 2)
    } finally {
      fetchGetShouldError = false
    }
  })
})
