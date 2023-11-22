/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  nextBuild,
  nextStart,
  killApp,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
const appPage = join(appDir, 'pages/_app.js')
const errorPage = join(appDir, 'pages/_error.js')
let app
let appPort

describe('Static 404 page', () => {
  afterEach(async () => {
    await fs.remove(appPage)
    await fs.remove(errorPage)
    await fs.remove(nextConfig)
  })
  beforeEach(() => fs.remove(join(appDir, '.next/server')))

  describe('With config enabled', () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it('should export 404 page without custom _error', async () => {
          await nextBuild(appDir)
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
          const html = await renderViaHTTP(appPort, '/non-existent')
          await killApp(app)
          expect(html).toContain('This page could not be found')
        })

        it('should not export 404 page with custom _error GIP', async () => {
          await fs.writeFile(
            errorPage,
            `
        import Error from 'next/error'
        export default class MyError extends Error {
          static getInitialProps({ statusCode, req }) {
            if (req.url === '/404' || req.url === '/404.html') {
              throw new Error('exported 404 unexpectedly!!!')
            }
            return {
              statusCode,
            }
          }
        }
      `
          )
          await nextBuild(appDir, undefined, { stderr: true, stdout: true })
          await fs.remove(errorPage)
        })

        it('should not export 404 page with getInitialProps in _app', async () => {
          await fs.writeFile(
            appPage,
            `
        const Page = ({ Component, pageProps }) => {
          return <Component {...pageProps} />
        }
        Page.getInitialProps = () => ({ hello: 'world', pageProps: {} })
        export default Page
      `
          )
          await nextBuild(appDir)
          await fs.remove(appPage)
        })
      }
    )
  })
})
