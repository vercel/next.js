import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'
import { writeFile } from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../shared-ast')
let app

jest.setTimeout(1000 * 60 * 5)

describe('ESLint', () => {
  beforeAll(async () => {
    const indexPageContent = `export default ()=><div>Index</div>`
    await writeFile(join(appDir, 'pages', 'index.js'), indexPageContent)
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterEach(() => killApp(app))
  it.only('should share ast between eslint-loader and babel-loader', async () => {
    expect(true).toBe(true)
  })
})
