import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('chrome-devtools-workspace default', () => {
  const { isNextDev, next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'default'),
  })

  it('should be able to connect to Chrome DevTools in dev', async () => {
    const devtoolsResponse = await next.fetch(
      '/.well-known/appspecific/com.chrome.devtools.json'
    )
    if (isNextDev) {
      const json = await devtoolsResponse.json()
      expect(json).toEqual({
        workspace: {
          uuid: expect.any(String),
          root: next.testDir,
        },
      })

      const pageReload = await next.fetch(
        '/.well-known/appspecific/com.chrome.devtools.json'
      )
      // The UUID should be stable across reloads.
      // Otherwise you'd have to reconnect every-time.
      expect(await pageReload.json()).toEqual(json)
    } else {
      expect({ status: devtoolsResponse.status }).toEqual({ status: 404 })
    }
  })
})

// The endpoint is only served by the dev server.
// @force-gate dev
describe('chrome-devtools-workspace persistence', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'persistence'),
  })

  it('persists the UUID when the cache directory does not exist yet', async () => {
    const cacheDir = path.join(next.distDir, 'cache')
    const uuidFile = path.join(cacheDir, 'chrome-devtools-workspace-uuid')
    // Dev server startup asynchronously writes other files into the cache
    // directory (the server actions encryption key, and with webpack the dev
    // tools config). Wait for them so they don't recreate the directory after
    // we've removed it.
    const startupFiles = isTurbopack
      ? ['.rscinfo']
      : ['.rscinfo', 'next-devtools-config.json']
    await retry(async () => {
      for (const file of startupFiles) {
        expect({
          file,
          exists: await next.hasFile(path.join(cacheDir, file)),
        }).toEqual({ file, exists: true })
      }
    })
    await next.remove(cacheDir)
    expect(await next.hasFile(cacheDir)).toBe(false)

    const devtoolsResponse = await next.fetch(
      '/.well-known/appspecific/com.chrome.devtools.json'
    )
    const json = await devtoolsResponse.json()
    expect(json).toEqual({
      workspace: {
        uuid: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        ),
        root: next.testDir,
      },
    })
    expect(next.cliOutput).not.toContain(
      'Failed to persist Chrome DevTools workspace UUID'
    )
    expect(await next.readFile(uuidFile)).toBe(json.workspace.uuid)

    // A fresh server process must reuse the persisted UUID.
    await next.stop()
    await next.start()

    const restartedResponse = await next.fetch(
      '/.well-known/appspecific/com.chrome.devtools.json'
    )
    expect(await restartedResponse.json()).toEqual(json)
  })
})

describe('chrome-devtools-workspace proxy', () => {
  const { isNextDev, next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'proxy'),
  })

  it('should be able to connect to Chrome DevTools in dev', async () => {
    const devtoolsResponse = await next.fetch(
      '/.well-known/appspecific/com.chrome.devtools.json'
    )
    if (isNextDev) {
      const json = await devtoolsResponse.json()
      expect(json).toEqual({
        workspace: {
          uuid: expect.any(String),
          root: next.testDir,
        },
      })

      const pageReload = await next.fetch(
        '/.well-known/appspecific/com.chrome.devtools.json'
      )
      // The UUID should be stable across reloads.
      // Otherwise you'd have to reconnect every-time.
      expect(await pageReload.json()).toEqual(json)
    } else {
      expect({ status: devtoolsResponse.status }).toEqual({ status: 404 })
    }
  })
})
