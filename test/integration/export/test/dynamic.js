/* global test */
import 'testcafe'
import { join } from 'path'
import { File, runNextCommand } from 'next-test-utils'

export default function () {
  test('Should throw error not matched route', async t => {
    const nextConfig = new File(join(t.fixtureCtx.appDir, 'next.config.js'))
    nextConfig.replace('/blog/nextjs/comment/test', '/bad/path')
    const outdir = join(t.fixtureCtx.appDir, 'outDynamic')
    const { stderr } = await runNextCommand(
      ['export', t.fixtureCtx.appDir, '--outdir', outdir],
      { stderr: true }
    ).catch(err => err)

    await t
      .expect(stderr)
      .contains('https://err.sh/zeit/next.js/export-path-mismatch')
    nextConfig.restore()
  })
}
