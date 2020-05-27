/* eslint-env jest */
import { join } from 'path'
import { File, runNextCommand } from 'next-test-utils'

export default function (context) {
  describe('Dynamic routes export', () => {
    const nextConfig = new File(join(context.appDir, 'next.config.js'))
    beforeEach(() => {
      nextConfig.replace('/blog/nextjs/comment/test', '/bad/path')
    })
    afterEach(() => {
      nextConfig.restore()
    })

    it('Should throw error not matched route', async () => {
      const outdir = join(context.appDir, 'outDynamic')
      const { stderr } = await runNextCommand(
        ['export', context.appDir, '--outdir', outdir],
        { stderr: true }
      ).catch((err) => err)

      expect(stderr).toContain(
        'https://err.sh/vercel/next.js/export-path-mismatch'
      )
    })
  })
}
