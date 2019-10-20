/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { remove } from 'fs-extra'
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

test('should not warn about missing cache in non-CI', async t => {
  await remove(join(appDir, '.next'))

  const { stdout } = await nextBuild(appDir, undefined, {
    stdout: true,
    env: {
      CI: '',
      CIRCLECI: '',
      TRAVIS: '',
      SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: ''
    }
  })
  await t.expect(stdout).notContains('no-cache')
})

test('should warn about missing cache in CI', async t => {
  await remove(join(appDir, '.next'))

  let { stdout } = await nextBuild(appDir, undefined, {
    stdout: true,
    env: { CI: '1' }
  })
  await t.expect(stdout).contains('no-cache')

  // Do not warn after cache is present
  ;({ stdout } = await nextBuild(appDir, undefined, {
    stdout: true,
    env: { CI: '1' }
  }))
  await t.expect(stdout).notContains('no-cache')
})
