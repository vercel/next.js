/* eslint-env jest */
import { join } from 'path'
import cheerio from 'cheerio'
import { runNextCommand } from 'next-test-utils'

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

      it('Should compile the app', async () => {
        const output = await runNextCommand(['build', appDir], { stdout: true })
        expect(output.stdout).toMatch(/Compiled successfully/)
      })
    })
  })
}
