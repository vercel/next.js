/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import { nextBuild, nextExport } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = path.join(__dirname, '..')
const outdir = path.join(__dirname, 'out')
const nextConfig = path.join(appDir, 'next.config.js')
let stderr

const runTests = () => {
  it('should show warning for query provided for auto exported page correctly', async () => {
    expect(stderr).toContain(
      'Warn: you provided query values for / which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add `getInitialProps`'
    )

    expect(stderr).not.toContain('/amp')
    expect(stderr).not.toContain('/ssr')
    expect(stderr).not.toContain('/ssg')
    expect(stderr).not.toContain('/hello')
  })
}

let origNextConfig

describe('Auto Export', () => {
  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      const { stderr: curStderr } = await nextExport(
        appDir,
        { outdir },
        { stderr: true }
      )
      stderr = curStderr
    })

    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      origNextConfig = await fs.readFile(nextConfig, 'utf8')
      await nextBuild(appDir)
      const { stderr: curStderr } = await nextExport(
        appDir,
        { outdir },
        { stderr: true }
      )
      stderr = curStderr
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origNextConfig)
    })

    runTests()
  })
})
