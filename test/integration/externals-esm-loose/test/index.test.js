/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  nextBuild,
  findPort,
  nextStart,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  "Handle ESM externals with esmExternals: 'loose'",
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          await fs.remove(join(appDir, '.next'))
          await nextBuild(appDir)
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
        })
        afterAll(() => killApp(app))

        const expected =
          /Hello <!-- -->World<!-- -->\+<!-- -->World<!-- -->\+<!-- -->World/

        it('should render the static page', async () => {
          const html = await renderViaHTTP(appPort, '/static')
          expect(html).toMatch(expected)
        })

        it('should render the ssr page', async () => {
          const html = await renderViaHTTP(appPort, '/ssr')
          expect(html).toMatch(expected)
        })

        it('should render the ssg page', async () => {
          const html = await renderViaHTTP(appPort, '/ssg')
          expect(html).toMatch(expected)
        })
      }
    )
  }
)
