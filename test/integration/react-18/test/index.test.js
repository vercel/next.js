/* eslint-env jest */

import { join } from 'path'

import {
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  fetchViaHTTP,
} from 'next-test-utils'
import blocking from './blocking'
import concurrent from './concurrent'
import basics from './basics'
import strictMode from './strict-mode'

// overrides react and react-dom to v18
const nodeArgs = ['-r', join(__dirname, 'require-hook.js')]
const appDir = join(__dirname, '../app')
const nextConfig = new File(join(appDir, 'next.config.js'))
const dynamicHello = new File(join(appDir, 'components/dynamic-hello.js'))
const unwrappedPage = new File(join(appDir, 'pages/suspense/unwrapped.js'))

const USING_CREATE_ROOT = 'Using the createRoot API for React'

async function getBuildOutput(dir) {
  const { stdout, stderr } = await nextBuild(dir, [], {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
  return stdout + stderr
}

async function getDevOutput(dir) {
  const port = await findPort()

  let stdout = ''
  let stderr = ''
  let instance = await launchApp(dir, port, {
    stdout: true,
    stderr: true,
    onStdout(msg) {
      stdout += msg
    },
    onStderr(msg) {
      stderr += msg
    },
    nodeArgs,
  })
  await killApp(instance)
  return stdout + stderr
}

describe('React 18 Support', () => {
  describe('Use legacy render', () => {
    beforeAll(() => {
      nextConfig.replace('reactRoot: true', 'reactRoot: false')
    })
    afterAll(() => {
      nextConfig.restore()
    })

    test('supported version of react in dev', async () => {
      const output = await getDevOutput(appDir)
      expect(output).not.toMatch(USING_CREATE_ROOT)
    })

    test('supported version of react in build', async () => {
      const output = await getBuildOutput(appDir)
      expect(output).not.toMatch(USING_CREATE_ROOT)
    })

    test('suspense is not allowed in blocking rendering mode', async () => {
      nextConfig.replace('withReact18({', '/*withReact18*/({')
      const { stderr, code } = await nextBuild(appDir, [], {
        stderr: true,
      })
      nextConfig.replace('/*withReact18*/({', 'withReact18({')

      expect(stderr).toContain(
        'Invalid suspense option usage in next/dynamic. Read more: https://nextjs.org/docs/messages/invalid-dynamic-suspense'
      )
      expect(code).toBe(1)
    })
  })
})

describe('Basics', () => {
  runTests('default setting with react 18', (context) => basics(context))

  it('suspense is not allowed in blocking rendering mode (dev)', async () => {
    // set dynamic.suspense = true but not wrapping with <Suspense>
    unwrappedPage.replace('wrapped = true', 'wrapped = false')
    const appPort = await findPort()
    const app = await launchApp(appDir, appPort, { nodeArgs })
    const html = await renderViaHTTP(appPort, '/suspense/unwrapped')
    unwrappedPage.restore()
    await killApp(app)

    expect(html).toContain(
      'A React component suspended while rendering, but no fallback UI was specified'
    )
  })
})

// React 18 with Strict Mode enabled might cause double invocation of lifecycle methods.
describe('Strict mode - dev', () => {
  const context = { appDir }

  beforeAll(async () => {
    nextConfig.replace('// reactStrictMode: true,', 'reactStrictMode: true,')
    context.appPort = await findPort()
    context.server = await launchApp(context.appDir, context.appPort, {
      nodeArgs,
    })
  })

  afterAll(() => {
    nextConfig.restore()
    killApp(context.server)
  })

  strictMode(context)
})

describe('Blocking mode', () => {
  beforeAll(() => {
    dynamicHello.replace('suspense = false', `suspense = true`)
  })
  afterAll(() => {
    dynamicHello.restore()
  })

  runTests('`runtime` is disabled', (context) =>
    blocking(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  )
})

function runTestsAgainstRuntime(runtime) {
  describe(`Concurrent mode in the ${runtime} runtime`, () => {
    beforeAll(async () => {
      nextConfig.replace("// runtime: 'edge'", `runtime: '${runtime}'`)
      dynamicHello.replace('suspense = false', `suspense = true`)
      // `noSSR` mode will be ignored by suspense
      dynamicHello.replace('let ssr', `let ssr = false`)
    })
    afterAll(async () => {
      nextConfig.restore()
      dynamicHello.restore()
    })

    runTests(`runtime is set to '${runtime}'`, (context) => {
      concurrent(context, (p, q) => renderViaHTTP(context.appPort, p, q))

      it('should stream to users', async () => {
        const res = await fetchViaHTTP(context.appPort, '/ssr')
        expect(res.headers.get('etag')).toBeNull()
      })

      it('should not stream to bots', async () => {
        const res = await fetchViaHTTP(
          context.appPort,
          '/ssr',
          {},
          {
            headers: {
              'user-agent': 'Googlebot',
            },
          }
        )
        expect(res.headers.get('etag')).toBeDefined()
      })

      it('should not stream to google pagerender bot', async () => {
        const res = await fetchViaHTTP(
          context.appPort,
          '/ssr',
          {},
          {
            headers: {
              'user-agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36 Google-PageRenderer Google (+https://developers.google.com/+/web/snippet/)',
            },
          }
        )
        expect(res.headers.get('etag')).toBeDefined()
      })
    })
  })
}

function runTest(mode, name, fn) {
  const context = { appDir }
  describe(`${name} (${mode})`, () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.stderr = ''
      if (mode === 'dev') {
        context.server = await launchApp(context.appDir, context.appPort, {
          nodeArgs,
          onStderr(msg) {
            context.stderr += msg
          },
        })
      } else {
        await nextBuild(context.appDir, [], { nodeArgs })
        context.server = await nextStart(context.appDir, context.appPort, {
          nodeArgs,
          onStderr(msg) {
            context.stderr += msg
          },
        })
      }
    })
    afterAll(async () => {
      await killApp(context.server)
    })
    fn(context)
  })
}

runTestsAgainstRuntime('edge')
runTestsAgainstRuntime('nodejs')

function runTests(name, fn) {
  runTest('dev', name, fn)
  runTest('prod', name, fn)
}
