/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { nextBuild, File, waitFor } from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('Build warnings')

test('should not shown warning about minification withou any modification', async t => {
  const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
  await t.expect(stderr).notContains('optimization has been disabled')
})

test('should shown warning about minification for minimize', async t => {
  const nextConfig = new File(join(appDir, 'next.config.js'))

  await waitFor(500)

  nextConfig.replace('true', 'false')

  const { stderr } = await nextBuild(appDir, undefined, { stderr: true })

  await t.expect(stderr).contains('optimization has been disabled')

  nextConfig.restore()
})

test('should shown warning about minification for minimizer', async t => {
  const nextConfig = new File(join(appDir, 'next.config.js'))

  await waitFor(500)

  nextConfig.replace(
    'config.optimization.minimize = true',
    'config.optimization.minimizer = []'
  )

  const { stderr } = await nextBuild(appDir, undefined, { stderr: true })

  await t.expect(stderr).contains('optimization has been disabled')

  nextConfig.restore()
})
