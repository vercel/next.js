/* eslint-env jest */
import { join } from 'path'
import { File, nextExport } from 'next-test-utils'

export default function (context) {
  describe('Dynamic routes builds', () => {
    const nextConfig = new File(join(context.appDir, 'next.config.js'))
    beforeEach(() => {
      nextConfig.replace('/blog/nextjs/comment/test', '/bad/path')
    })
    afterEach(() => {
      nextConfig.restore()
    })

    it('Should throw error not matched route', async () => {
      try {
        const outdir = join(context.appDir, 'outDynamic')
        await nextExport(context.appDir, { outdir, stderr: true })
      } catch (e) {
        expect(e.Error).toContain(
          'https://err.sh/zeit/next.js/wrong-path-for-dynamic-page-export'
        )
      }
    })
  })
}
