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
            runtime: 'experimental-edge',
            allowDynamic: '**'
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
            allowDynamic: '**'
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
            runtime: 'experimental-edge',
            allowDynamic: '/lib/**'
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
            allowDynamic: '/lib/**'
          }
        `)
        context.lib.write(`
          export async function hasDynamic() {
            eval('100')
          }
        `)
      },
    },
  ])('$title with allowed dynamic code', ({ init, url }) => {
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
            runtime: 'experimental-edge',
            allowDynamic: '**'
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
            allowDynamic: '**'
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
            runtime: 'experimental-edge',
            allowDynamic: '/lib/**'
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
            allowDynamic: '/lib/**'
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
  ])('$title with allowed unused dynamic code', ({ init, url }) => {
    beforeEach(() => init())

    it('build and does not warn at runtime', async () => {
      const output = await nextBuild(context.appDir, undefined, {
        stdout: true,
        stderr: true,
      })
      expect(output.stderr).not.toContain(`Build failed`)
      context.app = await nextStart(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(res.status).toBe(200)
      expect(context.logs.output).not.toContain(`warn`)
      expect(context.logs.output).not.toContain(
        `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
      )
    })
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
            runtime: 'experimental-edge',
            allowDynamic: '/pages/**'
          }
        `)
        context.lib.write(`
          export async function hasDynamic() {
            eval('100')
          }
        `)
      },
    },
  ])('$title with dynamic code', ({ init, url }) => {
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

    it('fails to build because of dynamic code evaluation', async () => {
      const output = await nextBuild(context.appDir, undefined, {
        stdout: true,
        stderr: true,
      })
      expect(output.stderr).toContain(`Build failed`)
      expect(output.stderr).not.toContain(
        `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
      )
    })
  })
})
