import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'

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
