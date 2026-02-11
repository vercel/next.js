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
import { isNextDeploy, isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'

const appDir = __dirname

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

describe('pages ssg data deployment skew - hard navigate when a new deployment occurs', () => {
  if (process.platform === 'win32') {
    it('should skip this suite on Windows', () => {})
    return
  }

  if (isNextDev) {
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
  }

  if (isNextStart) {
    describe.each([
      { name: 'with build id' },
      {
        name: 'with deployment id',
        NEXT_DEPLOYMENT_ID1: 'deployment-id-1',
        NEXT_DEPLOYMENT_ID2: 'deployment-id-2',
      },
      { name: 'with build id (output export)', OUTPUT_MODE: 'export' },
    ])(
      'production mode $name',
      ({ NEXT_DEPLOYMENT_ID1, NEXT_DEPLOYMENT_ID2, OUTPUT_MODE }) => {
        let shouldSwitchDeployment = false
        let apps = []
        let proxyServer

        beforeAll(async () => {
          await nextBuild(appDir, [], {
            env: {
              DIST_DIR: '1',
              NEXT_DEPLOYMENT_ID: NEXT_DEPLOYMENT_ID1,
              OUTPUT_MODE,
            },
          })
          let appPort1 = await findPort()
          apps.push(
            await nextStart(appDir, appPort1, {
              env: {
                DIST_DIR: '1',
                NEXT_DEPLOYMENT_ID: NEXT_DEPLOYMENT_ID1,
                OUTPUT_MODE,
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
  }

  describe('header with deployment id', () => {
    const { next } = nextTestSetup({
      files: appDir,
      env: {
        // rely on skew protection when deployed
        NEXT_DEPLOYMENT_ID: isNextDeploy ? undefined : 'test-deployment-id',
      },
    })

    // Deployment skew is hard to properly e2e deploy test, so this just checks for the header.
    it('header is set on data routes', async () => {
      for (const route of ['/gsp', '/gssp']) {
        await next.fetch(route)
        let res = await next.fetch(`/_next/data/${next.buildId}${route}.json`)

        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toStartWith('application/json')
        expect(res.headers.get('x-nextjs-deployment-id')).toBeTruthy()
      }
    })
  })
})
