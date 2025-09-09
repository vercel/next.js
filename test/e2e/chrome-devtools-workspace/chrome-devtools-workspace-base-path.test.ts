import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('chrome-devtools-workspace basePath', () => {
  const { isNextDev, next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'base-path'),
  })

  it('should be able to connect to Chrome DevTools in dev with a configured basePath', async () => {
    const devtoolsResponse = await next.fetch(
      // Chrome DevTools always requests `/`.
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
    } else {
      expect({ status: devtoolsResponse.status }).toEqual({ status: 404 })
    }
  })
})
