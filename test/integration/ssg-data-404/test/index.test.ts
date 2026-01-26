/* eslint-env jest */

import { join } from 'path'
import http from 'http'
import httpProxy from 'http-proxy'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

const appDir = join(__dirname, '..')

let proxyPort

const runTests = (switchDeployment: (bool) => void) => {
  it('index to gsp', async () => {
    switchDeployment(false)
    const browser = await webdriver(proxyPort, '/')

    await browser.eval('window.beforeNav = 1')
    await browser.waitForElementByCss('#index')

    switchDeployment(true)

    await browser.eval(`(function() {
      window.next.router.push('/gsp')
    })()`)
    await browser.waitForElementByCss('#gsp')

    expect(await browser.eval('window.beforeNav')).toBeFalsy()
  })

  it('gsp to gssp', async () => {
    switchDeployment(false)
    const browser = await webdriver(proxyPort, '/gsp')

    await browser.eval('window.beforeNav = 1')
    await browser.waitForElementByCss('#gsp')

    switchDeployment(true)

    await browser.eval(`(function() {
      window.next.router.push('/gssp')
    })()`)
    await browser.waitForElementByCss('#gssp')

    expect(await browser.eval('window.beforeNav')).toBeFalsy()
  })
}

describe('SSG data 404 - hard navigate when a new deployment occurs', () => {
  if (process.platform === 'win32') {
    it('should skip this suite on Windows', () => {})
    return
  }

  describe('development mode', () => {
    let should404Data = false
    let apps = []
    let proxyServer

    beforeAll(async () => {
      const appPort = await findPort()
      apps.push(await launchApp(appDir, appPort))

      const proxy = httpProxy.createProxyServer({
        target: `http://localhost:${appPort}`,
      })
      proxyPort = await findPort()

      proxyServer = http.createServer((req, res) => {
        req.on('error', (e) => {
          require('console').error(e)
        })
        res.on('error', (e) => {
          require('console').error(e)
        })
        if (should404Data && req.url.match(/\/_next\/data/)) {
          res.statusCode = 404
          return res.end('not found')
        }
        proxy.web(req, res)
      })

      await new Promise<void>((resolve) => {
        proxyServer.listen(proxyPort, () => resolve())
      })
    })
    afterAll(async () => {
      for (const app of apps) {
        await killApp(app)
      }
      proxyServer.close()
    })

    runTests((v) => {
      should404Data = v
    })
  })

  describe.each([
    { name: 'with build id' },
    {
      name: 'with deployment id',
      NEXT_DEPLOYMENT_ID1: 'deployment-id-1',
      NEXT_DEPLOYMENT_ID2: 'deployment-id-2',
    },
  ])(
    'production mode $name',
    ({ NEXT_DEPLOYMENT_ID1, NEXT_DEPLOYMENT_ID2 }) => {
      let shouldSwitchDeployment = false
      let apps = []
      let proxyServer

      beforeAll(async () => {
        await nextBuild(appDir, [], {
          env: {
            DIST_DIR: '1',
            NEXT_DEPLOYMENT_ID: NEXT_DEPLOYMENT_ID1,
          },
        })
        let appPort1 = await findPort()
        apps.push(
          await nextStart(appDir, appPort1, {
            env: {
              DIST_DIR: '1',
              NEXT_DEPLOYMENT_ID: NEXT_DEPLOYMENT_ID1,
            },
          })
        )

        await nextBuild(appDir, [], {
          env: {
            DIST_DIR: '2',
            NEXT_DEPLOYMENT_ID: NEXT_DEPLOYMENT_ID2,
          },
        })
        let appPort2 = await findPort()
        apps.push(
          await nextStart(appDir, appPort2, {
            env: {
              DIST_DIR: '2',
              NEXT_DEPLOYMENT_ID: NEXT_DEPLOYMENT_ID2,
            },
          })
        )

        const proxy1 = httpProxy.createProxyServer({
          target: `http://localhost:${appPort1}`,
        })
        const proxy2 = httpProxy.createProxyServer({
          target: `http://localhost:${appPort2}`,
        })
        proxyPort = await findPort()

        proxyServer = http.createServer((req, res) => {
          req.on('error', (e) => {
            require('console').error(e)
          })
          res.on('error', (e) => {
            require('console').error(e)
          })

          if (shouldSwitchDeployment) {
            proxy2.web(req, res, undefined, (e) => {
              require('console').error(e)
            })
            return
          }

          proxy1.web(req, res, undefined, (e) => {
            require('console').error(e)
          })
        })

        await new Promise<void>((resolve) => {
          proxyServer.listen(proxyPort, () => resolve())
        })
      })
      afterAll(async () => {
        for (const app of apps) {
          await killApp(app)
        }
        proxyServer.close()
      })

      runTests((v) => {
        shouldSwitchDeployment = v
      })
    }
  )
})
