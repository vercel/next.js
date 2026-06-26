import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('trailingSlash:true with rewrites and getStaticProps', () => {
  if ((global as any).isNextDeploy) {
    it('should skip for deploy mode for now', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, './app')),
  })

  it('should work', async () => {
    const res = await fetchViaHTTP(next.url, '/country')
    expect(await res.text()).toContain('Welcome home')
  })
})
