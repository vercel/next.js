/* eslint-env jest */
import { fetchViaHTTP } from 'next-test-utils'
import url from 'url'

module.exports = (context) => {
  describe('With Security Related Issues', () => {
    it('should not allow accessing files outside .next/static and .next/server directory', async () => {
      const pathsToCheck = [
        `/_next/static/../BUILD_ID`,
        `/_next/static/../routes-manifest.json`,
      ]
      for (const path of pathsToCheck) {
        const res = await fetchViaHTTP(context.appPort, path)
        const text = await res.text()
        try {
          expect(res.status).toBe(404)
          expect(text).toMatch(/This page could not be found/)
        } catch (err) {
          throw new Error(`Path ${path} accessible from the browser`)
        }
      }
    })

    it('should handle encoded / value for trailing slash correctly', async () => {
      const res = await fetchViaHTTP(
        context.appPort,
        '/%2fexample.com/',
        undefined,
        { redirect: 'manual' }
      )

      const { pathname, hostname } = url.parse(
        res.headers.get('location') || ''
      )
      expect(res.status).toBe(308)
      expect(pathname).toBe('/%2fexample.com')
      expect(hostname).not.toBe('example.com')
    })
  })
}
