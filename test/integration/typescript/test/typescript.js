/* eslint-env jest */
import { join } from 'path'
import cheerio from 'cheerio'
import { runNextCommand, File } from 'next-test-utils'

const appDir = join(__dirname, '../')

export default (context, render) => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }
  describe('TypeScript', () => {
    describe('default behavior', () => {
      it('should render the page', async () => {
        const $ = await get$('/hello')
        expect($('body').text()).toMatch(/Hello World/)
      })

      it('should compile the app', async () => {
        const output = await runNextCommand(['build', appDir], { stdout: true })
        expect(output.stdout).toMatch(/Compiled successfully/)
      })
    })

    describe('should compile with different types', () => {
      const nextConfig = new File(join(appDir, 'pages/_error.tsx'))
      beforeEach(() => {
        nextConfig.replace('static ', 'static async ')
      })
      afterEach(() => {
        nextConfig.restore()
      })

      it('should compile async getInitialProps for _error', async () => {
        const output = await runNextCommand(['build', appDir], { stdout: true })
        expect(output.stdout).toMatch(/Compiled successfully/)
      })
    })
  })
}
