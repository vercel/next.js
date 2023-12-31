import { createNextDescribe } from 'e2e-utils'
import { join } from 'path'

createNextDescribe(
  'app-static-custom-cache-handler-esm',
  {
    files: __dirname,
    env: {
      CUSTOM_CACHE_HANDLER: join(
        __dirname,
        './cache-handler-default-export.js'
      ),
    },
  },
  ({ next, isNextStart }) => {
    if (!isNextStart) {
      it('should skip', () => {})
      return
    }

    it('should have logs from cache-handler', async () => {
      expect(next.cliOutput).toContain('initialized custom cache-handler')
      expect(next.cliOutput).toContain('cache-handler get')
      expect(next.cliOutput).toContain('cache-handler set')
    })
  }
)
