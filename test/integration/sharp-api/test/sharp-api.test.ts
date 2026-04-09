/* eslint-env jest */

import {
  fetchViaHTTP,
  findPort,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import execa from 'execa'
import fs from 'fs-extra'
import { join } from 'path'

const appDir = join(__dirname, '../app')
let app, appPort

describe('sharp api', () => {
  beforeAll(async () => {
    await execa('npm', ['install'], { cwd: appDir, stdio: 'inherit' })
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    if (app) {
      await killApp(app)
    }
    await fs.remove(join(appDir, '.next'))
    await fs.remove(join(appDir, 'node_modules'))
  })

  it('should handle custom sharp usage', async () => {
    const res = await fetchViaHTTP(appPort, '/api/custom-sharp')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
    const traceFile = await fs.readJson(
      join(
        appDir,
        '.next',
        'server',
        'pages',
        'api',
        'custom-sharp.js.nft.json'
      )
    )
    expect(traceFile.files.some((file) => file.includes('sharp/'))).toBe(true)
  })
})
