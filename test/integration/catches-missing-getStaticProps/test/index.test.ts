/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  nextBuild,
  launchApp,
  findPort,
  killApp,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const errorRegex = /getStaticPaths was added without a getStaticProps in/

describe('Catches Missing getStaticProps', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      it('should catch it in development mode', async () => {
        const appPort = await findPort()
        const app = await launchApp(appDir, appPort)
        const html = await renderViaHTTP(appPort, '/hello')
        await killApp(app)

        expect(html).toMatch(errorRegex)
      })
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should catch it in server build mode', async () => {
        const { stderr } = await nextBuild(appDir, [], {
          stderr: true,
        })
        expect(stderr).toMatch(errorRegex)
      })
    }
  )
})
