/* eslint-env jest */
import {
  fetchViaHTTP,
  findPort,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '../app')

describe('Image Generation', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      let app
      let appPort

      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      it('should generate the image without errors', async () => {
        const res = await fetchViaHTTP(appPort, '/api/image')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('image/png')

        const buffer = await res.buffer()

        // It should be a PNG
        expect(
          [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
            (b, i) => buffer[i] === b
          )
        ).toBeTrue()
      })
    }
  )
})
