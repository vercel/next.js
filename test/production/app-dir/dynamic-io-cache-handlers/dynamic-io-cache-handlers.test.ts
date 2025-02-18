import path from 'path'
import { createNext, FileRef, NextInstance } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  retry,
} from 'next-test-utils'

describe('dynamic-io-cache-handlers', () => {
  let appPort: number
  let server: any
  let output = ''
  let next: NextInstance

  if (process.env.__NEXT_EXPERIMENTAL_PPR) {
    return it('should skip', () => {})
  }

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
        
          expireTags(...tags) {
            console.log('symbol expireTags', tags)
          },
        
          receiveExpiredTags(...tags) {
            console.log('symbol receiveExpiredTags', tags)
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
          require('console').log(data)
        },
        onStderr(data) {
          output += data
          require('console').log(data)
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
      expect(output).toContain('symbol receiveExpiredTags')
      expect(output).toContain('symbol get')
      expect(output).toContain('symbol set')
    })
  })

  it('should call expireTags on global default cache handler', async () => {
    const res = await fetchViaHTTP(appPort, '/revalidate-tag', { tag: 'tag1' })
    expect(res.status).toBe(200)

    await retry(() => {
      expect(output).toContain('symbol receiveExpiredTags')
      expect(output).toContain('symbol expireTags')
      expect(output).toContain('tag1')
    })
  })
})
