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
  it('should catch it in dev mode', async () => {
    const appPort = await findPort()
    const app = await launchApp(appDir, appPort)
    const html = await renderViaHTTP(appPort, '/hello')
    await killApp(app)

    expect(html).toMatch(errorRegex)
  })

  it('should catch it in server build mode', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toMatch(errorRegex)
  })
})
