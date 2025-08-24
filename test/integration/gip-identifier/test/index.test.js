/* eslint-env jest */

import cheerio from 'cheerio'
import fs from 'fs-extra'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')
const appPage = join(appDir, 'pages/_app.js')
const indexPage = join(appDir, 'pages/index.js')

let app
let appPort
let indexPageContent

const runTests = (isDev) => {
  const getData = async () => {
    if (isDev) {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    } else {
      const { code } = await nextBuild(appDir)
      if (code !== 0) throw new Error(`build faild, exit code: ${code}`)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    }
    const html = await renderViaHTTP(appPort, '/')
    await killApp(app)
    const $ = cheerio.load(html)
    return JSON.parse($('#__NEXT_DATA__').text())
  }

  it('should not have gip or appGip in NEXT_DATA for page without getInitialProps', async () => {
    const data = await getData()
    expect(data.gip).toBe(undefined)
    expect(data.appGip).toBe(undefined)
  })

  it('should have gip in NEXT_DATA for page with getInitialProps', async () => {
    indexPageContent = await fs.readFile(indexPage, 'utf8')
    await fs.writeFile(
      indexPage,
      `
      const Page = () => 'hi'
      Page.getInitialProps = () => ({ hello: 'world' })
      export default Page
    `
    )
    const data = await getData()
    expect(data.gip).toBe(true)
  })

  it('should have gip and appGip in NEXT_DATA for page with getInitialProps and _app with getInitialProps', async () => {
    await fs.writeFile(
      appPage,
      `
      const App = ({ Component, pageProps }) => <Component {...pageProps} />
      App.getInitialProps = async (ctx) => {
        let pageProps = {}
        if (ctx.Component.getInitialProps) {
          pageProps = await ctx.Component.getInitialProps(ctx.ctx)
        }
        return { pageProps }
      }
      export default App
    `
    )
    const data = await getData()
    expect(data.gip).toBe(true)
    expect(data.appGip).toBe(true)
  })

  it('should only have appGip in NEXT_DATA for page without getInitialProps and _app with getInitialProps', async () => {
    await fs.writeFile(indexPage, indexPageContent)
    const data = await getData()
    await fs.remove(appPage)
    expect(data.gip).toBe(undefined)
    expect(data.appGip).toBe(true)
  })
}

describe('gip identifiers', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      runTests(true)
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      runTests()
    }
  )
})
