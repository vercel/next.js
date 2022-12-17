import path from 'path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('app dir imports', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'import')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
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
})
