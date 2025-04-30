/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app
const nextConfigContent = `
module.exports = {
  reactStrictMode: true,
}
`

describe('410 Error Validation', () => {
  beforeAll(async () => {
    await fs.writeFile(nextConfig, nextConfigContent, 'utf8')
  })

  afterAll(async () => {
    await fs.remove(nextConfig)
  })

  describe('Development Mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: { NODE_ENV: 'development' },
      })
    })

    afterAll(async () => {
      await killApp(app)
    })

    it('should show error when both gone and notFound are returned', async () => {
      const html = await renderViaHTTP(appPort, '/gone-and-not-found')
      expect(html).toContain(
        '`notFound` and `gone` can not both be returned from getServerSideProps'
      )
    })

    it('should show error when both gone and redirect are returned', async () => {
      const html = await renderViaHTTP(appPort, '/gone-and-redirect')
      expect(html).toContain(
        '`redirect` and `gone` can not both be returned from getServerSideProps'
      )
    })
  })

  describe('Build Mode', () => {
    it('should fail build when both gone and notFound are returned in getStaticProps', async () => {
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      expect(code).toBe(1)
      expect(stderr).toContain(
        '`notFound` and `gone` can not both be returned from getStaticProps'
      )
    })
  })
})
