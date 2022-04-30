import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'

const appDir = path.join(__dirname, 'app')

function runTest(packageManager?: string) {
  describe(`styled-jsx${packageManager ? ' ' + packageManager : ''}`, () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          pages: new FileRef(path.join(appDir, 'pages')),
        },
        ...(packageManager
          ? {
              installCommand: `npx ${packageManager} install`,
            }
          : {}),
      })
    })
    afterAll(() => next.destroy())

    it('should contain styled-jsx styles in html', async () => {
      const html = await renderViaHTTP(next.url, '/')
      const $ = cheerio.load(html)
      const isReact17 = process.env.NEXT_TEST_REACT_VERSION === '^17'
      expect($(isReact17 ? 'head' : 'body').text()).toMatch(/color:(\s)*red/)
    })
  })
}

runTest()
runTest('pnpm')
