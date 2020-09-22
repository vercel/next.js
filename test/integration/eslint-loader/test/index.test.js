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

let appDir
let appPort
let app

jest.setTimeout(1000 * 60 * 5)

describe('ESLint', () => {
  afterEach(() => killApp(app))
  it('should be able to build if no errors or warnings are found.', async () => {
    const indexPageContent = `export default ()=><div>Index</div>`
    const homePageContent = `export default ()=><div>Home</div>`
    appDir = join(__dirname, '../basic')
    await writeFile(join(appDir, 'pages', 'index.js'), indexPageContent)
    await writeFile(join(appDir, 'pages', 'home.js'), homePageContent)
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    join(appDir, '.next', 'server')
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('<div>Index</div>')
  })
  it('should throw build errors as seen by eslint', async () => {
    appDir = join(__dirname, '../basic')
    const indexPageContent = `export default ()=><div>{true ? 'Index': 'Blah' }</div>`
    const homePageContent = `export default ()=><div>Home {f}</div>`
    appDir = join(__dirname, '../basic')
    await writeFile(join(appDir, 'pages', 'index.js'), indexPageContent)
    await writeFile(join(appDir, 'pages', 'home.js'), homePageContent)
    const { code, stdout, stderr } = await nextBuild(appDir, [], {
      ignoreFail: true,
      stderr: true,
      stdout: true,
    })
    expect(code).toBe(1)
    expect(stderr).toContain('Build failed due to ESLint errors.')
    expect(stdout).toContain(
      'info  - Creating an optimized production build...'
    )
    expect(stdout).toContain(
      'test/integration/eslint-loader/basic/pages/home.js'
    )
    expect(stdout).toContain(
      '1:26  error  Unexpected constant condition  no-constant-condition'
    )
    expect(stdout).toContain(
      'test/integration/eslint-loader/basic/pages/index.js'
    )
    expect(stdout).toContain(`1:31  error  'f' is not defined  no-undef`)
  })
})
