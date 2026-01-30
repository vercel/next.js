import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-module-type', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  // bytes type is Turbopack-only, webpack doesn't have a direct equivalent
  const itTurbopackOnly = isTurbopack ? it : it.skip

  it('should load svg as asset/resource and return URL', async () => {
    const $ = await next.render$('/')
    const src = $('#svg-url').text()
    // asset/resource should emit the file and return URL path
    expect(src).toMatch(/\/_next\/static\/media\/test\.[a-f0-9]+\.svg$/)
  })

  itTurbopackOnly(
    'should load data file as bytes and return Uint8Array',
    async () => {
      const $ = await next.render$('/')
      const bytesType = $('#bytes-type').text()
      const bytesLength = $('#bytes-length').text()
      const bytesText = $('#bytes-text').text()

      // eslint-disable-next-line jest/no-standalone-expect
      expect(bytesType).toBe('Uint8Array')
      // eslint-disable-next-line jest/no-standalone-expect
      expect(bytesLength).toBe('11')
      // eslint-disable-next-line jest/no-standalone-expect
      expect(bytesText).toBe('hello world')
    }
  )
})
