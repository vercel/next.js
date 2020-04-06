/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { findPort, launchApp, killApp, renderViaHTTP } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '..')
const indexPage = join(appDir, 'pages/index.js')

let stderr = ''
let appPort
let app

describe('pageProps GSSP conflict', () => {
  it('should show warning for pageProps and getServerSideProps conflict', async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg || ''
      },
    })
    await fs.writeFile(
      indexPage,
      `
      export const getServerSideProps = () => ({ props: { hi: 'hi' } })
      export default () => 'hello from gssp'
    `
    )
    const html = await renderViaHTTP(appPort, '/')
    await fs.remove(indexPage)
    await killApp(app)

    expect(html).toContain('hello from gssp')
    expect(stderr).toContain(
      `"pageProps" was returned from "_app" for page "/" with getServerSideProps`
    )
  })

  it('should show warning for pageProps and getStaticProps conflict', async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg || ''
      },
    })
    await fs.writeFile(
      indexPage,
      `
      export const getStaticProps = () => ({ props: { hi: 'hi' } })
      export default () => 'hello from gsp'
    `
    )
    const html = await renderViaHTTP(appPort, '/')
    await fs.remove(indexPage)
    await killApp(app)

    expect(html).toContain('hello from gsp')
    expect(stderr).toContain(
      `"pageProps" was returned from "_app" for page "/" with getStaticProps`
    )
  })
})
