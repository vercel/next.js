/* eslint-env jest */
import type { Context } from './types'

export default function (context: Context) {
  describe('API routes export', () => {
    it('Should throw if a route is matched', async () => {
      const { next } = context
      const nextConfigPath = 'next.config.js'
      const nextConfig = await next.readFile(nextConfigPath)
      await next.patchFile(
        nextConfigPath,
        nextConfig.replace('// API route', `'/data': { page: '/api/data' },`)
      )
      const outdir = 'outApi'
      const { exitCode, cliOutput } = await next.export({ outdir })
      await next.patchFile(nextConfigPath, nextConfig)

      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain(
        'https://nextjs.org/docs/messages/api-routes-static-export'
      )
    })
  })
}
