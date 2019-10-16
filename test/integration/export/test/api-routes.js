/* global test */
import 'testcafe'
import { join } from 'path'
import { File, runNextCommand } from 'next-test-utils'

export default function () {
  test('Should throw if a route is matched', async t => {
    const nextConfig = new File(join(t.fixtureCtx.appDir, 'next.config.js'))
    nextConfig.replace('// API route', `'/data': { page: '/api/data' },`)
    const outdir = join(t.fixtureCtx.appDir, 'outApi')
    const { stdout } = await runNextCommand(
      ['export', t.fixtureCtx.appDir, '--outdir', outdir],
      { stdout: true }
    )

    await t
      .expect(stdout)
      .contains('https://err.sh/zeit/next.js/api-routes-static-export')
    nextConfig.restore()
  })
}
