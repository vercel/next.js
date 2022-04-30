import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'

function runTest(packageManager?: string) {
  describe(`styled-jsx${packageManager ? ' ' + packageManager : ''}`, () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'pages/index.js': `
            export default function Page() {
              return (
                <div>
                  <style jsx>{'p { color: red; }'}</style>
                  <p>hello world</p>
                </div>
              )
            }
          `,
        },
        ...(packageManager
          ? {
              installCommand: `${packageManager} install`,
            }
          : {}),
      })
    })
    afterAll(() => next.destroy())

    it('should contain styled-jsx styles in html', async () => {
      const html = await renderViaHTTP(next.url, '/')
      const $ = cheerio.load(html)
      expect($('head').text()).toContain('color:red')
    })
  })
}

runTest()
runTest('pnpm')
