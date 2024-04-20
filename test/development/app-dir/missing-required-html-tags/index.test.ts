import { nextTestSetup } from 'e2e-utils'
import { hasRedbox } from 'next-test-utils'

describe('app-dir - missing required html tags', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should not error', async () => {
    const browser = await next.browser('/')

    expect(await hasRedbox(browser)).toBe(false)
  })
})
