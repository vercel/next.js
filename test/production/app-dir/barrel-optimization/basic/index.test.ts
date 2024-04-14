import { createNextDescribe } from 'e2e-utils'

describe('Skipped in Turbopack', () => {
  createNextDescribe(
    'app-dir - optimizePackageImports - basic',
    {
      files: __dirname,
    },
    ({ next }) => {
      it('should build successfully', async () => {
        // Ensure that MUI is working
        const $ = await next.render$('/')
        expect(await $('#client-mod').text()).toContain('client:default')
      })
    }
  )
})
