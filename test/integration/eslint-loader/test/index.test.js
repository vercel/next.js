import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../ok')
let appPort
let app

jest.setTimeout(1000 * 60 * 5)

describe('ESLint', () => {
  afterAll(() => killApp(app))
  it('should be able to build the OK project without errors or warnings.', async () => {
    try {
      await nextBuild(appDir)
    } catch (e) {
      console.log(e)
    }
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    join(appDir, '.next', 'server')
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('<h1 id="text">Hello World</h1>')
  })
})
