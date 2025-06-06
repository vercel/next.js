import { nextTestSetup } from 'e2e-utils'

describe('chrome-devtools-workspace', () => {
  const { isNextDev, next } = nextTestSetup({
    files: __dirname,
  })

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
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
    } else {
      expect({ status: devtoolsResponse.status }).toEqual({ status: 404 })
    }
  })
})
