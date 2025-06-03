/* eslint-env jest */

import { fetchViaHTTP, findPort, killApp, launchApp } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'babel-next-image',
  () => {
    let appPort
    let app

    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(__dirname, appPort)
    })

    afterAll(() => killApp(app))

    it('should work with babel and next/image', async () => {
      const res = await fetchViaHTTP(appPort, '/')
      expect(res.status).toBe(200)
    })
  }
)
