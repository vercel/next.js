/* eslint-env jest */

import stripAnsi from 'next/dist/compiled/strip-ansi'
import { getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage } from 'next/dist/build/utils'
import fs from 'fs-extra'
import { dirname, join } from 'path'
import {
  check,
  fetchViaHTTP,
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const WEBPACK_BREAKING_CHANGE = 'BREAKING CHANGE:'
const context = {
  appDir: join(__dirname, '../'),
  buildLogs: { output: '', stdout: '', stderr: '' },
  logs: { output: '', stdout: '', stderr: '' },
  middleware: new File(join(__dirname, '../middleware.js')),
  page: new File(join(__dirname, '../pages/index.js')),
}

describe('Middleware importing Node.js modules', () => {
  function getModuleNotFound(name) {
    return `Module not found: Can't resolve '${name}'`
  }

  function escapeLF(s) {
    return s.replace(/\n/g, '\\n')
  }

  afterEach(() => {
    context.middleware.restore()
    context.page.restore()
    if (context.app) {
      killApp(context.app)
    }
  })

  describe('dev mode', () => {
    // restart the app for every test since the latest error is not shown sometimes
    // See https://github.com/vercel/next.js/issues/36575
    beforeEach(async () => {
      context.logs = { output: '', stdout: '', stderr: '' }
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
        onStdout(msg) {
          context.logs.output += msg
          context.logs.stdout += msg
        },
        onStderr(msg) {
          context.logs.output += msg
          context.logs.stderr += msg
        },
      })
    })

    it('shows the right error when importing `path` on middleware', async () => {
      context.middleware.write(`
        import { NextResponse } from 'next/server'
        import { basename } from 'path'

        export async function middleware(request) {
          console.log(basename('/foo/bar/baz/asdf/quux.html'))
          return NextResponse.next()
        }
      `)
      const res = await fetchViaHTTP(context.appPort, '/')
      const text = await res.text()
      await waitFor(500)
      const msg = getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('path')
      expect(res.status).toBe(500)
      expect(context.logs.output).toContain(getModuleNotFound('path'))
      expect(context.logs.output).toContain(msg)
      expect(text).toContain(escapeLF(msg))
      expect(stripAnsi(context.logs.output)).toContain(
        "import { basename } from 'path'"
      )
      expect(context.logs.output).not.toContain(WEBPACK_BREAKING_CHANGE)
    })

    it('shows the right error when importing `child_process` on middleware', async () => {
      context.middleware.write(`
        import { NextResponse } from 'next/server'
        import { spawn } from 'child_process'
        
        export async function middleware(request) {
          console.log(spawn('ls', ['-lh', '/usr']))
          return NextResponse.next()
        }      
      `)
      const res = await fetchViaHTTP(context.appPort, '/')
      const text = await res.text()
      await waitFor(500)
      const msg =
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('child_process')
      expect(res.status).toBe(500)
      expect(context.logs.output).toContain(getModuleNotFound('child_process'))
      expect(context.logs.output).toContain(msg)
      expect(text).toContain(escapeLF(msg))
      expect(stripAnsi(context.logs.output)).toContain(
        "import { spawn } from 'child_process'"
      )
      expect(context.logs.output).not.toContain(WEBPACK_BREAKING_CHANGE)
    })

    it('shows the right error when importing a non-node-builtin module on middleware', async () => {
      context.middleware.write(`
        import { NextResponse } from 'next/server'
        import NotExist from 'not-exist'
        
        export async function middleware(request) {
          new NotExist()
          return NextResponse.next()
        }
      `)
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)

      const text = await res.text()
      await waitFor(500)
      const msg =
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('not-exist')
      expect(context.logs.output).toContain(getModuleNotFound('not-exist'))
      expect(context.logs.output).not.toContain(msg)
      expect(text).not.toContain(escapeLF(msg))
    })

    it('shows the right error when importing `child_process` on a page', async () => {
      context.page.write(`
        import { spawn } from 'child_process'
        export default function Page() {
          spawn('ls', ['-lh', '/usr'])
          return <div>ok</div>
        }      
      `)

      await fetchViaHTTP(context.appPort, '/')

      // Need to request twice
      // See: https://github.com/vercel/next.js/issues/36387
      const res = await fetchViaHTTP(context.appPort, '/')
      expect(res.status).toBe(500)

      const text = await res.text()
      await waitFor(500)
      const msg =
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('child_process')
      expect(context.logs.output).toContain(getModuleNotFound('child_process'))
      expect(context.logs.output).not.toContain(msg)
      expect(text).not.toContain(escapeLF(msg))
    })

    it('warns about nested middleware being not allowed', async () => {
      const aboutMiddleware = join(__dirname, '../pages/about/_middleware.js')
      const apiMiddleware = join(__dirname, '../pages/api/_middleware.js')

      await fs.ensureDir(dirname(aboutMiddleware))
      await fs.ensureDir(dirname(apiMiddleware))
      await fs.writeFile(aboutMiddleware, `export function middleware() {}`)
      await fs.writeFile(apiMiddleware, `export function middleware() {}`)

      try {
        const res = await fetchViaHTTP(context.appPort, '/about')
        expect(res.status).toBe(200)

        await check(() => {
          return context.logs.stderr.includes(
            'Nested Middleware is not allowed, found:'
          ) &&
            context.logs.stderr.includes('pages/about/_middleware') &&
            context.logs.stderr.includes('pages/api/_middleware')
            ? 'success'
            : context.logs.output
        }, 'success')
      } finally {
        await fs.remove(aboutMiddleware)
        await fs.remove(apiMiddleware)
      }
    })
  })

  describe('production mode', () => {
    it('fails with the right middleware error during build', async () => {
      context.middleware.write(`
        import { NextResponse } from 'next/server'
        import { spawn } from 'child_process'
        
        export async function middleware(request) {
          console.log(spawn('ls', ['-lh', '/usr']))
          return NextResponse.next()
        }      
      `)
      const buildResult = await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })

      expect(buildResult.stderr).toContain(getModuleNotFound('child_process'))
      expect(buildResult.stderr).toContain(
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('child_process')
      )
      expect(buildResult.stderr).not.toContain(WEBPACK_BREAKING_CHANGE)
    })

    it('fails with the right page error during build', async () => {
      context.page.write(`
        import { spawn } from 'child_process'
        export default function Page() {
          spawn('ls', ['-lh', '/usr'])
          return <div>ok</div>
        }      
      `)

      const buildResult = await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })

      expect(buildResult.stderr).toContain(getModuleNotFound('child_process'))
      expect(buildResult.stderr).not.toContain(
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('child_process')
      )
    })

    it('fails when there is a not allowed middleware', async () => {
      const aboutMiddleware = join(__dirname, '../pages/about/_middleware.js')
      const apiMiddleware = join(__dirname, '../pages/api/_middleware.js')

      await fs.ensureDir(dirname(aboutMiddleware))
      await fs.ensureDir(dirname(apiMiddleware))
      await fs.writeFile(aboutMiddleware, `export function middleware() {}`)
      await fs.writeFile(apiMiddleware, `export function middleware() {}`)

      const buildResult = await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })
      await fs.remove(aboutMiddleware)
      await fs.remove(apiMiddleware)

      expect(buildResult.stderr).toContain(
        'Nested Middleware is not allowed, found:'
      )
      expect(buildResult.stderr).toContain('pages/about/_middleware')
      expect(buildResult.stderr).toContain('pages/api/_middleware')
    })
  })
})
