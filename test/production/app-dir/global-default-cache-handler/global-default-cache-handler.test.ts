import path from 'path'
import { createNext, FileRef, NextInstance } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  retry,
} from 'next-test-utils'

describe('global-default-cache-handler', () => {
  let appPort: number
  let server: any
  let output = ''
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(__dirname),
      skipStart: true,
    })
    await next.build()

    const standaloneServer = '.next/standalone/server.js'
    await next.patchFile(
      standaloneServer,
      `
      globalThis[Symbol.for('@next/cache-handlers')] = {
        DefaultCache: {
          get(cacheKey, softTags) {
            console.log('symbol get', cacheKey, softTags)
          },
          
          set(cacheKey, entry) {
            console.log('symbol set', cacheKey)
          },
        
          refreshTags() {
            console.log('symbol refreshTags')
          },

          getExpiration(...tags) {
            console.log('symbol getExpiration', tags)
          },
        
          updateTags(...tags) {
            console.log('symbol updateTags', tags)
          }
        }
      }
      ${await next.readFile(standaloneServer)}`
    )

    appPort = await findPort()

    require('console').error(
      'starting standalone mode',
      path.join(next.testDir, standaloneServer)
    )

    server = await initNextServerScript(
      path.join(next.testDir, standaloneServer),
      /- Local:/,
      {
        ...process.env,
        PORT: `${appPort}`,
      },
      undefined,
      {
        cwd: next.testDir,
        shouldRejectOnError: true,
        onStdout(data) {
          output += data
        },
        onStderr(data) {
          output += data
        },
      }
    )
  })
  afterAll(async () => {
    await next.destroy()
    await killApp(server)
  })

  it('should use global symbol for default cache handler', async () => {
    const res = await fetchViaHTTP(appPort, '/')
    expect(res.status).toBe(200)

    await retry(() => {
      expect(output).toContain('symbol get')
      expect(output).toContain('symbol set')
    })
  })

  it('should call updateTags on global default cache handler', async () => {
    const res = await fetchViaHTTP(appPort, '/revalidate-tag', { tag: 'tag1' })
    expect(res.status).toBe(200)

    await retry(() => {
      expect(output).toContain('symbol updateTags')
      expect(output).toContain('tag1')
    })
  })

  it('should call refreshTags on global default cache handler', async () => {
    const res = await fetchViaHTTP(appPort, '/', {})
    expect(res.status).toBe(200)

    await retry(async () => {
      expect(output).toContain('symbol refreshTags')
    })
  })
})
