/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  File,
  findPort,
  killApp,
  launchApp,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const distDir = join(appDir, '.next-custom')
const nextConfig = new File(join(appDir, 'next.config.js'))
let app
let appPort

describe('app dir - with output export and custom distDir (next dev)', () => {
  beforeAll(async () => {
    nextConfig.replace('// distDir', 'distDir')
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    nextConfig.restore()
    await fs.remove(distDir)
    await killApp(app)
  })

  it('should render properly', async () => {
    const res = await fetchViaHTTP(appPort, '/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Home')
  })
})
