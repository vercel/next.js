import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('trailingSlash:true with rewrites and getStaticProps', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip for deploy mode for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, './app')),
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const res = await fetchViaHTTP(next.url, '/country')
    expect(await res.text()).toContain('Welcome home')
  })
})
