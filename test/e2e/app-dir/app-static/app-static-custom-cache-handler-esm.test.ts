import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-static-custom-cache-handler-esm',
  {
    files: __dirname,
    env: {
      CUSTOM_CACHE_HANDLER: '1',
    },
  },
  ({ next, isNextStart }) => {
    if (!isNextStart) {
      it('should skip', () => {})
      return
    }

    beforeAll(async () => {
      await next.stop()
      const nextConfig = await next.readFile('./next.config.js')
      await next.patchFile(
        './next.config.js',
        nextConfig.replace(
          'cache-handler.js',
          'cache-handler-default-export.js'
        )
      )
    })

    it('should have logs from cache-handler', async () => {
      const { cliOutput } = await next.build()

      expect(cliOutput).toContain('initialized custom cache-handler')
      expect(cliOutput).toContain('cache-handler get')
      expect(cliOutput).toContain('cache-handler set')
    })
  }
)
