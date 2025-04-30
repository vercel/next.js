/* eslint-env jest */
import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  fetchViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

describe('410 Page Support', () => {
  describe('Development Mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })

    afterAll(async () => {
      await killApp(app)
    })

    it('should render the custom 410 page with the correct status code', async () => {
      const res = await fetchViaHTTP(appPort, '/gone-page')
      expect(res.status).toBe(410)

      const html = await res.text()
      expect(html).toContain('Custom 410 Page')
    })

    it('should handle getServerSideProps returning gone: true', async () => {
      const res = await fetchViaHTTP(appPort, '/server-side-gone')
      expect(res.status).toBe(410)
    })

    it('should handle getStaticProps returning gone: true with fallback: true', async () => {
      const res = await fetchViaHTTP(appPort, '/static-props-gone/deleted')
      expect(res.status).toBe(410)
    })
  })

  describe('Production Mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })

    afterAll(async () => {
      await killApp(app)
    })

    it('should render the custom 410 page with the correct status code', async () => {
      const res = await fetchViaHTTP(appPort, '/gone-page')
      expect(res.status).toBe(410)

      const html = await res.text()
      expect(html).toContain('Custom 410 Page')
    })

    it('should handle getServerSideProps returning gone: true', async () => {
      const res = await fetchViaHTTP(appPort, '/server-side-gone')
      expect(res.status).toBe(410)
    })

    it('should handle getStaticProps returning gone: true with fallback: true', async () => {
      const res = await fetchViaHTTP(appPort, '/static-props-gone/deleted')
      expect(res.status).toBe(410)
    })

    it('should include noindex meta tag', async () => {
      const res = await fetchViaHTTP(appPort, '/gone-page')
      const html = await res.text()
      expect(html).toContain('<meta name="robots" content="noindex')
    })
  })
})
