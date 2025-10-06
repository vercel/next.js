/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  fetchViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  it('should respond to a not existing page with 404', async () => {
    const res = await fetchViaHTTP(appPort, '/post/2')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('custom 404 page')
  })
}

describe('Custom 404 Page for static site generation with dynamic routes', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      afterAll(() => killApp(app))

      it('should build successfully', async () => {
        const { code } = await nextBuild(appDir, [], {
          stderr: true,
          stdout: true,
        })

        expect(code).toBe(0)

        appPort = await findPort()

        app = await nextStart(appDir, appPort)
      })

      runTests('server')
    }
  )
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests('dev')
    }
  )
})
