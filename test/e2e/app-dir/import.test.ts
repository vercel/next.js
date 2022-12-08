import path from 'path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('app dir imports', () => {
  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  function runTests() {
    beforeAll(async () => {
      next = await createNext({
        files: new FileRef(path.join(__dirname, 'import')),
        dependencies: {
          react: 'experimental',
          'react-dom': 'experimental',
          typescript: 'latest',
          '@types/react': 'latest',
          '@types/node': 'latest',
        },
      })
    })
    afterAll(() => next.destroy())
    ;['js', 'jsx', 'ts', 'tsx'].forEach((ext) => {
      it(`we can import all components from .${ext}`, async () => {
        const html = await renderViaHTTP(next.url, `/${ext}`)
        const $ = cheerio.load(html)
        expect($('#js').text()).toBe('CompJs')
      })
    })
  }

  runTests()
})
