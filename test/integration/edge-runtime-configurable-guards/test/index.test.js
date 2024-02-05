/* eslint-env jest */

import { join } from 'path'
import {
  fetchViaHTTP,
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  retry,
  waitFor,
} from 'next-test-utils'
import { remove } from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const context = {
  appDir: join(__dirname, '../'),
  logs: { output: '', stdout: '', stderr: '' },
  api: new File(join(__dirname, '../pages/api/route.js')),
  middleware: new File(join(__dirname, '../middleware.js')),
  lib: new File(join(__dirname, '../lib/index.js')),
}
const appOption = {
  env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
  onStdout(msg) {
    context.logs.output += msg
    context.logs.stdout += msg
  },
  onStderr(msg) {
    context.logs.output += msg
    context.logs.stderr += msg
  },
}
const routeUrl = '/api/route'
const middlewareUrl = '/'
const TELEMETRY_EVENT_NAME = 'NEXT_EDGE_ALLOW_DYNAMIC_USED'

describe('Edge runtime configurable guards', () => {
  beforeEach(async () => {
    await remove(join(__dirname, '../.next'))
    context.appPort = await findPort()
    context.logs = { output: '', stdout: '', stderr: '' }
  })

  afterEach(() => {
    if (context.app) {
      killApp(context.app)
    }
    context.api.restore()
    context.middleware.restore()
    context.lib.restore()
  })

  describe('Multiple functions with different configurations', () => {
    beforeEach(() => {
      context.middleware.write(`
        import { NextResponse } from 'next/server'

        export default () => {
          eval('100')
          return NextResponse.next()
        }
        export const config = {
          unstable_allowDynamic: '/middleware.js'
        }
      `)
      context.api.write(`
        export default async function handler(request) {
          eval('100')
          return Response.json({ result: true })
        }
        export const config = {
          runtime: 'edge',
          unstable_allowDynamic: '/lib/**'
        }
      `)
    })

    it('warns in dev for allowed code', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, middlewareUrl)
      await waitFor(500)
      expect(res.status).toBe(200)
      await retry(async () => {
        expect(context.logs.output).toContain(
          `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
        )
      })
    })

    it('warns in dev for unallowed code', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, routeUrl)
      expect(res.status).toBe(200)
      await retry(async () => {
        expect(context.logs.output).toContain(
          `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
        )
      })
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it('fails to build because of unallowed code', async () => {
          const output = await nextBuild(context.appDir, undefined, {
            stdout: true,
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
          })
          expect(output.stderr).toContain(`Build failed`)
          expect(output.stderr).toContain(`./pages/api/route.js`)
          expect(output.stderr).toContain(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
          )
          expect(output.stderr).toContain(`Used by default`)
          expect(output.stderr).toContain(TELEMETRY_EVENT_NAME)
        })
      }
    )
  })

  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
      init() {
        context.api.write(`
          export default async function handler(request) {
            eval('100')
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '**'
          }
        `)
      },
    },
    {
      title: 'Middleware',
      url: middlewareUrl,
      init() {
        context.middleware.write(`
          import { NextResponse } from 'next/server'

          export default () => {
            eval('100')
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '**'
          }
        `)
      },
    },
    {
      title: 'Edge API using lib',
      url: routeUrl,
      init() {
        context.api.write(`
          import { hasDynamic } from '../../lib'
          export default async function handler(request) {
            await hasDynamic()
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '/lib/**'
          }
        `)
        context.lib.write(`
          export async function hasDynamic() {
            eval('100')
          }
        `)
      },
    },
    {
      title: 'Middleware using lib',
      url: middlewareUrl,
      init() {
        context.middleware.write(`
          import { NextResponse } from 'next/server'
          import { hasDynamic } from './lib'

          // populated with tests
          export default async function () {
            await hasDynamic()
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '/lib/**'
          }
        `)
        context.lib.write(`
          export async function hasDynamic() {
            eval('100')
          }
        `)
      },
    },
  ])('$title with allowed, used dynamic code', ({ init, url }) => {
    beforeEach(() => init())

    it('still warns in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      await waitFor(500)
      expect(res.status).toBe(200)
      expect(context.logs.output).toContain(
        `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
      )
    })
  })

  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
      init() {
        context.api.write(`
          export default async function handler(request) {
            if ((() => false)()) {
              eval('100')
            }
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '**'
          }
        `)
      },
    },
    {
      title: 'Middleware',
      url: middlewareUrl,
      init() {
        context.middleware.write(`
          import { NextResponse } from 'next/server'
          // populated with tests
          export default () => {
            if ((() => false)()) {
              eval('100')
            }
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '**'
          }
        `)
      },
    },
    {
      title: 'Edge API using lib',
      url: routeUrl,
      init() {
        context.api.write(`
          import { hasUnusedDynamic } from '../../lib'
          export default async function handler(request) {
            await hasUnusedDynamic()
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '/lib/**'
          }
        `)
        context.lib.write(`
          export async function hasUnusedDynamic() {
            if ((() => false)()) {
              eval('100')
            }
          }
        `)
      },
    },
    {
      title: 'Middleware using lib',
      url: middlewareUrl,
      init() {
        context.middleware.write(`
          import { NextResponse } from 'next/server'
          import { hasUnusedDynamic } from './lib'
          // populated with tests
          export default async function () {
            await hasUnusedDynamic()
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '/lib/**'
          }
        `)
        context.lib.write(`
          export async function hasUnusedDynamic() {
            if ((() => false)()) {
              eval('100')
            }
          }
        `)
      },
    },
  ])('$title with allowed, unused dynamic code', ({ init, url }) => {
    beforeEach(() => init())
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it('build and does not warn at runtime', async () => {
          const output = await nextBuild(context.appDir, undefined, {
            stdout: true,
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
          })
          expect(output.stderr).not.toContain(`Build failed`)
          expect(output.stderr).toContain(TELEMETRY_EVENT_NAME)
          context.appPort = await findPort()
          context.app = await nextStart(
            context.appDir,
            context.appPort,
            appOption
          )
          const res = await fetchViaHTTP(context.appPort, url)
          expect(res.status).toBe(200)
          expect(context.logs.output).not.toContain(`warn`)
          expect(context.logs.output).not.toContain(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
          )
        })
      }
    )
  })

  describe.each([
    {
      title: 'Edge API using lib',
      url: routeUrl,
      init() {
        context.api.write(`
          import { hasDynamic } from '../../lib'
          export default async function handler(request) {
            await hasDynamic()
            return Response.json({ result: true })
          }
          export const config = {
            runtime: 'edge',
            unstable_allowDynamic: '/pages/**'
          }
        `)
        context.lib.write(`
          export async function hasDynamic() {
            eval('100')
          }
        `)
      },
    },
    {
      title: 'Middleware using lib',
      url: middlewareUrl,
      init() {
        context.middleware.write(`
          import { NextResponse } from 'next/server'
          import { hasDynamic } from './lib'
          export default async function () {
            await hasDynamic()
            return NextResponse.next()
          }
          export const config = {
            unstable_allowDynamic: '/pages/**'
          }
        `)
        context.lib.write(`
          export async function hasDynamic() {
            eval('100')
          }
        `)
      },
    },
  ])('$title with unallowed, used dynamic code', ({ init, url }) => {
    beforeEach(() => init())

    it('warns in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      await waitFor(500)
      expect(res.status).toBe(200)
      expect(context.logs.output).toContain(
        `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
      )
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it('fails to build because of dynamic code evaluation', async () => {
          const output = await nextBuild(context.appDir, undefined, {
            stdout: true,
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
          })
          expect(output.stderr).toContain(`Build failed`)
          expect(output.stderr).toContain(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
          )
          expect(output.stderr).toContain(TELEMETRY_EVENT_NAME)
        })
      }
    )
  })

  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
      init() {
        context.api.write(`
          export default async function handler(request) {
            return Response.json({ result: (() => {}) instanceof Function })
          }
          export const config = { runtime: 'edge' }
        `)
      },
    },
    {
      title: 'Middleware',
      url: middlewareUrl,
      init() {
        context.middleware.write(`
          import { NextResponse } from 'next/server'
          import { returnTrue } from './lib'
          export default async function () {
            (() => {}) instanceof Function
            return NextResponse.next()
          }
        `)
      },
    },
  ])('$title with use of Function as a type', ({ init, url }) => {
    beforeEach(() => init())

    it('does not warn in dev at runtime', async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      await waitFor(500)
      expect(res.status).toBe(200)
      expect(context.logs.output).not.toContain(
        `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
      )
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        // eslint-disable-next-line jest/no-identical-title
        it('build and does not warn at runtime', async () => {
          const output = await nextBuild(context.appDir, undefined, {
            stdout: true,
            stderr: true,
          })
          expect(output.stderr).not.toContain(`Build failed`)
          context.appPort = await findPort()
          context.app = await nextStart(
            context.appDir,
            context.appPort,
            appOption
          )
          const res = await fetchViaHTTP(context.appPort, url)
          expect(res.status).toBe(200)
          expect(context.logs.output).not.toContain(`warn`)
          expect(context.logs.output).not.toContain(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
          )
        })
      }
    )
  })
})
