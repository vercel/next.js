/* eslint-env jest */
import { join } from 'path'
import { File, runNextCommand } from 'next-test-utils'

export default function (context) {
  describe('API routes export', () => {
    const nextConfig = new File(join(context.appDir, 'next.config.js'))

    beforeEach(() => {
      nextConfig.replace('// API route', `'/data': { page: '/api/data' },`)
    })
    afterEach(() => {
      nextConfig.restore()
    })

    it('Should throw if a route is matched', async () => {
      const outdir = join(context.appDir, 'outApi')
      const { stderr } = await runNextCommand(
        ['export', context.appDir, '--outdir', outdir],
        { stderr: true }
      )

      expect(stderr).toContain(
        'https://err.sh/vercel/next.js/api-routes-static-export'
      )
    })
  })
}
