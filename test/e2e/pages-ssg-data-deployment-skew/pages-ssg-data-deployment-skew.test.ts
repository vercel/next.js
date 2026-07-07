import http from 'http'
import httpProxy from 'http-proxy'
import type { ChildProcess } from 'child_process'
import { findPort, killApp } from 'next-test-utils'
import { isNextDeploy, isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'

let proxyPort: number

const runTests = (
  next: ReturnType<typeof nextTestSetup>['next'],
  switchDeployment: (bool) => void
) => {
  it('index to gsp', async () => {
    switchDeployment(false)
    const browser = await next.browser('/', { baseUrl: proxyPort })

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
    const browser = await next.browser('/gsp', { baseUrl: proxyPort })

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

async function launchChildServer(
  next: ReturnType<typeof nextTestSetup>['next'],
  args: string[],
  env: Record<string, string> = {},
  readyPattern: RegExp = /- Local:|✓ Ready|Ready in/i
): Promise<{ child: ChildProcess; exit: Promise<any> }> {
  let child!: ChildProcess
  let resolveReady!: () => void
  let ready = false
  const readyPromise = new Promise<void>((r) => {
    resolveReady = () => {
      if (!ready) {
        ready = true
        r()
      }
    }
  })

  const exit = next
    .runCommand(args, {
      env,
      onStdout: (msg) => {
        if (readyPattern.test(msg)) resolveReady()
      },
      onStderr: (msg) => {
        if (readyPattern.test(msg)) resolveReady()
      },
      instance: (p) => {
        child = p
      },
    })
    .finally(() => {
      resolveReady()
    })

  await readyPromise
  return { child, exit }
}

describe('pages ssg data deployment skew - hard navigate when a new deployment occurs', () => {
  if (process.platform === 'win32') {
    it('should skip this suite on Windows', () => {})
    return
  }

  if (isNextDev) {
    describe('development mode', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      let should404Data = false
      let proxyServer: http.Server
      let devChild: ChildProcess | undefined
      let devExit: Promise<any> | undefined

      beforeAll(async () => {
        const appPort = await findPort()
        const { child, exit } = await launchChildServer(next, [
          'dev',
          '-p',
          String(appPort),
        ])
        devChild = child
        devExit = exit

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
          if (should404Data && req.url!.match(/\/_next\/data/)) {
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
        if (devChild) {
          await killApp(devChild).catch(() => {})
        }
        await devExit?.catch(() => {})
        proxyServer.close()
      })

      runTests(next, (v) => {
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
        const { next } = nextTestSetup({
          files: __dirname,
          skipStart: true,
          disableAutoSkewProtection: true,
        })

        let shouldSwitchDeployment = false
        let proxyServer: http.Server
        const runningChildren: ChildProcess[] = []
        const runningExits: Promise<any>[] = []

        beforeAll(async () => {
          const env1: Record<string, string> = { DIST_DIR: '1' }
          if (NEXT_DEPLOYMENT_ID1) env1.NEXT_DEPLOYMENT_ID = NEXT_DEPLOYMENT_ID1
          if (OUTPUT_MODE) env1.OUTPUT_MODE = OUTPUT_MODE

          const env2: Record<string, string> = { DIST_DIR: '2' }
          if (NEXT_DEPLOYMENT_ID2) env2.NEXT_DEPLOYMENT_ID = NEXT_DEPLOYMENT_ID2
          if (OUTPUT_MODE) env2.OUTPUT_MODE = OUTPUT_MODE

          await next.build({ env: env1 })
          const appPort1 = await findPort()
          const first = await launchChildServer(
            next,
            ['start', '-p', String(appPort1)],
            env1
          )
          runningChildren.push(first.child)
          runningExits.push(first.exit)

          await next.build({ env: env2 })
          const appPort2 = await findPort()
          const second = await launchChildServer(
            next,
            ['start', '-p', String(appPort2)],
            env2
          )
          runningChildren.push(second.child)
          runningExits.push(second.exit)

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
          for (const child of runningChildren) {
            await killApp(child).catch(() => {})
          }
          await Promise.all(runningExits.map((e) => e.catch(() => {})))
          proxyServer.close()
        })

        runTests(next, (v) => {
          shouldSwitchDeployment = v
        })
      }
    )
  }

  describe('header with deployment id', () => {
    const { next } = nextTestSetup({
      files: __dirname,
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
