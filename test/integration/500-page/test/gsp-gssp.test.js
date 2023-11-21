/* eslint-env jest */

import { move } from 'fs-extra'
import fs from 'fs'
import fsp from 'fs/promises'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const pages500 = join(appDir, 'pages/500.js')
const pagesApp = join(appDir, 'pages/_app.js')
const pagesError = join(appDir, 'pages/_error.js')
const gip500Err =
  /`pages\/500` can not have getInitialProps\/getServerSideProps/

let appPort
let app

describe('gsp-gssp', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('does not show error with getStaticProps in pages/500 build', async () => {
      await move(pages500, `${pages500}.bak`)
      await fsp.writeFile(
        pages500,
        `
      const page = () => 'custom 500 page'
      export const getStaticProps = () => ({ props: { a: 'b' } })
      export default page
    `
      )
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      await fsp.rm(pages500, { recursive: true, force: true })
      await move(`${pages500}.bak`, pages500)

      expect(stderr).not.toMatch(gip500Err)
      expect(code).toBe(0)
    })
    it('shows error with getServerSideProps in pages/500 build', async () => {
      await move(pages500, `${pages500}.bak`)
      await fsp.writeFile(
        pages500,
        `
        const page = () => 'custom 500 page'
        export const getServerSideProps = () => ({ props: { a: 'b' } })
        export default page
      `
      )
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      await fsp.rm(pages500, { recursive: true, force: true })
      await move(`${pages500}.bak`, pages500)

      expect(stderr).toMatch(gip500Err)
      expect(code).toBe(1)
    })

    it('does build 500 statically with getInitialProps in _app and getStaticProps in pages/500', async () => {
      await fsp.writeFile(
        pagesApp,
        `
        import App from 'next/app'
  
        const page = ({ Component, pageProps }) => <Component {...pageProps} />
        page.getInitialProps = (ctx) => App.getInitialProps(ctx)
        export default page
      `
      )
      await fsp.rename(pages500, `${pages500}.bak`)
      await fsp.writeFile(
        pages500,
        `
        const page = () => {
          console.log('rendered 500')
          return 'custom 500 page'
        }
        export default page
  
        export const getStaticProps = () => {
          return {
            props: {}
          }
        }
      `
      )
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      const {
        stderr,
        stdout: buildStdout,
        code,
      } = await nextBuild(appDir, [], {
        stderr: true,
        stdout: true,
      })

      await fsp.rm(pagesApp, { recursive: true, force: true })
      await fsp.rm(pages500, { recursive: true, force: true })
      await fsp.rename(`${pages500}.bak`, pages500)

      expect(stderr).not.toMatch(gip500Err)
      expect(buildStdout).toContain('rendered 500')
      expect(code).toBe(0)
      expect(fs.existsSync(join(appDir, '.next/server/pages/500.html'))).toBe(
        true
      )

      let appStdout = ''
      const appPort = await findPort()
      const app = await nextStart(appDir, appPort, {
        onStdout(msg) {
          appStdout += msg || ''
        },
        onStderr(msg) {
          appStdout += msg || ''
        },
      })

      await renderViaHTTP(appPort, '/err')
      await killApp(app)

      expect(appStdout).not.toContain('rendered 500')
    })

    it('does not build 500 statically with no pages/500 and getServerSideProps in _error', async () => {
      await fsp.rename(pages500, `${pages500}.bak`)
      await fsp.writeFile(
        pagesError,
        `
          function Error({ statusCode }) {
            return <p>Error status: {statusCode}</p>
          }
  
          export const getServerSideProps = ({ req, res, err }) => {
            console.error('called _error getServerSideProps')
  
            if (req.url === '/500') {
              throw new Error('should not export /500')
            }
  
            return {
              props: {
                statusCode: res && res.statusCode ? res.statusCode : err ? err.statusCode : 404
              }
            }
          }
  
          export default Error
        `
      )
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      const { stderr: buildStderr, code } = await nextBuild(appDir, [], {
        stderr: true,
      })
      await fsp.rename(`${pages500}.bak`, pages500)
      await fsp.rm(pagesError, { recursive: true, force: true })
      console.log(buildStderr)
      expect(buildStderr).not.toMatch(gip500Err)
      expect(code).toBe(0)
      expect(fs.existsSync(join(appDir, '.next/server/pages/500.html'))).toBe(
        false
      )

      let appStderr = ''
      const appPort = await findPort()
      const app = await nextStart(appDir, appPort, {
        onStderr(msg) {
          appStderr += msg || ''
        },
      })

      await renderViaHTTP(appPort, '/err')
      await killApp(app)

      expect(appStderr).toContain('called _error getServerSideProps')
    })
  })

  describe('development mode', () => {
    it('does not show error with getStaticProps in pages/500 dev', async () => {
      await move(pages500, `${pages500}.bak`)
      await fsp.writeFile(
        pages500,
        `
        const page = () => 'custom 500 page'
        export const getStaticProps = () => ({ props: { a: 'b' } })
        export default page
      `
      )

      let stderr = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
      await renderViaHTTP(appPort, '/abc')
      await waitFor(1000)

      await killApp(app)

      await fsp.rm(pages500, { recursive: true, force: true })
      await move(`${pages500}.bak`, pages500)

      expect(stderr).not.toMatch(gip500Err)
    })

    it('shows error with getServerSideProps in pages/500 dev', async () => {
      await move(pages500, `${pages500}.bak`)
      await fsp.writeFile(
        pages500,
        `
        const page = () => 'custom 500 page'
        export const getServerSideProps = () => ({ props: { a: 'b' } })
        export default page
      `
      )

      let stderr = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
      await renderViaHTTP(appPort, '/500')
      await waitFor(1000)

      await killApp(app)

      await fsp.rm(pages500, { recursive: true, force: true })
      await move(`${pages500}.bak`, pages500)

      expect(stderr).toMatch(gip500Err)
    })
  })
})
