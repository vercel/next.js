/* eslint-env jest */
import { fetchViaHTTP } from 'next-test-utils'

module.exports = context => {
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
  })
}
