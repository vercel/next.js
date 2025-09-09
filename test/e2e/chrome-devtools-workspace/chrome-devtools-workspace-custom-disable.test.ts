import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('chrome-devtools-workspace custom disable', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'custom-disable'),
  })

  it('can be disabled by providing your own endpoint', async () => {
    const devtoolsResponse = await next.fetch(
      '/.well-known/appspecific/com.chrome.devtools.json'
    )
    const json = await devtoolsResponse.json()
    expect(json).toEqual('Go away, Chrome DevTools!')
  })
})
