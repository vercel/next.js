/* global fixture, test */
import 'testcafe'

import path from 'path'
import fs from 'fs-extra'
import { nextBuild, nextExport } from 'next-test-utils'

const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')

fixture('Errors on output to public')

test('Throws error when `distDir` is set to public', async t => {
  await fs.writeFile(nextConfig, `module.exports = { distDir: 'public' }`)
  const results = await nextBuild(appDir, [], { stdout: true, stderr: true })
  await t
    .expect(results.stdout + results.stderr)
    .match(
      /The 'public' directory is reserved in Next.js and can not be set as/
    )
  await fs.remove(nextConfig)
})

test('Throws error when export out dir is public', async t => {
  await fs.remove(nextConfig)
  await nextBuild(appDir)
  const outdir = path.join(appDir, 'public')
  const results = await nextExport(
    appDir,
    { outdir },
    {
      stdout: true,
      stderr: true
    }
  )
  await t
    .expect(results.stdout + results.stderr)
    .match(
      /The 'public' directory is reserved in Next.js and can not be used as/
    )
})
