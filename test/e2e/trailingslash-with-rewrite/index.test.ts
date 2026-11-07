import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('trailingSlash:true with rewrites and getStaticProps', () => {
  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, './app')),
  })

  it('should work', async () => {
    const res = await fetchViaHTTP(next.url, '/country')
    expect(await res.text()).toContain('Welcome home')
  })
})
