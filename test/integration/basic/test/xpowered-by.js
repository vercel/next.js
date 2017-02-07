/* global describe, test, expect */
import { pkg } from 'next-test-utils'

export default function ({ app }) {
  describe('X-Powered-By header', () => {
    test('set it by default', async () => {
      const req = { url: '/stateless' }
      const headers = {}
      const res = {
        setHeader (key, value) {
          headers[key] = value
        },
        end () {}
      }

      await app.render(req, res, req.url)
      expect(headers['X-Powered-By']).toEqual(`Next.js ${pkg.version}`)
    })

    test('do not set it when poweredByHeader==false', async () => {
      const req = { url: '/stateless' }
      const originalConfigValue = app.config.poweredByHeader
      app.config.poweredByHeader = false
      const res = {
        setHeader (key, value) {
          if (key === 'X-Powered-By') {
            throw new Error('Should not set the X-Powered-By header')
          }
        },
        end () {}
      }

      await app.render(req, res, req.url)
      app.config.poweredByHeader = originalConfigValue
    })
  })
}
