/* global fixture, test */
import 'testcafe'

import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { validateAMP } from 'amp-test-utils'
import { File, nextBuild, nextExport, runNextCommand } from 'next-test-utils'

const access = promisify(fs.access)
const readFile = promisify(fs.readFile)
const appDir = join(__dirname, '../')
const outDir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))

fixture('AMP Validation on Export').before(async ctx => {
  const { stdout = '', stderr = '' } = await nextBuild(appDir, [], {
    stdout: true,
    stderr: true
  })
  await nextExport(appDir, { outdir: outDir })
  ctx.buildOutput = stdout + stderr
})

test('should have shown errors during build', async t => {
  await t
    .expect(t.fixtureCtx.buildOutput)
    .match(
      /error.*The tag 'img' may only appear as a descendant of tag 'noscript'. Did you mean 'amp-img'\?/
    )
  await t
    .expect(t.fixtureCtx.buildOutput)
    .match(
      /error.*The tag 'img' may only appear as a descendant of tag 'noscript'. Did you mean 'amp-img'\?/
    )
  await t
    .expect(t.fixtureCtx.buildOutput)
    .match(/warn.*The tag 'amp-video extension \.js script' is missing/)
})

test('should export AMP pages', async t => {
  const toCheck = ['first', 'second', 'third.amp']
  await Promise.all(
    toCheck.map(async page => {
      const content = await readFile(join(outDir, `${page}.html`))
      await validateAMP(content.toString())
    })
  )
})

test('shows AMP warning without throwing error', async t => {
  nextConfig.replace(
    '// exportPathMap',
    `exportPathMap: function(defaultMap) {
    return {
      '/cat': { page: '/cat' },
    }
  },`
  )

  try {
    const { stdout, stderr } = await runNextCommand(['export', appDir], {
      stdout: true,
      stderr: true
    })
    await t
      .expect(stdout)
      .match(/warn.*The tag 'amp-video extension \.js script' is missing/)
    await await t.expect(await access(join(outDir, 'cat.html'))).eql(undefined)
    await await t
      .expect(stderr)
      .notMatch(
        /Found conflicting amp tag "meta" with conflicting prop name="viewport"/
      )
  } finally {
    nextConfig.restore()
  }
})

test('throws error on AMP error', async t => {
  nextConfig.replace(
    '// exportPathMap',
    `exportPathMap: function(defaultMap) {
    return {
      '/dog': { page: '/dog' },
    }
  },`
  )

  try {
    const { stdout, stderr } = await runNextCommand(['export', appDir], {
      stdout: true,
      stderr: true
    })
    await t
      .expect(stdout)
      .match(
        /error.*The tag 'img' may only appear as a descendant of tag 'noscript'. Did you mean 'amp-img'\?/
      )
    await await t.expect(await access(join(outDir, 'dog.html'))).eql(undefined)
    await await t
      .expect(stderr)
      .notMatch(
        /Found conflicting amp tag "meta" with conflicting prop name="viewport"/
      )
  } finally {
    nextConfig.restore()
  }
})

test('shows warning and error when throwing error', async t => {
  nextConfig.replace(
    '// exportPathMap',
    `exportPathMap: function(defaultMap) {
    return {
      '/dog-cat': { page: '/dog-cat' },
    }
  },`
  )

  try {
    const { stdout, stderr } = await runNextCommand(['export', appDir], {
      stdout: true,
      stderr: true
    })
    await t
      .expect(stdout)
      .match(/warn.*The tag 'amp-video extension \.js script' is missing/)
    await t
      .expect(stdout)
      .match(
        /error.*The tag 'img' may only appear as a descendant of tag 'noscript'. Did you mean 'amp-img'\?/
      )
    await await t
      .expect(await access(join(outDir, 'dog-cat.html')))
      .eql(undefined)
    await await t
      .expect(stderr)
      .notMatch(
        /Found conflicting amp tag "meta" with conflicting prop name="viewport"/
      )
  } finally {
    nextConfig.restore()
  }
})
