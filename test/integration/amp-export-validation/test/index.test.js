/* eslint-env jest */
/* global jasmine */
import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { validateAMP } from 'amp-test-utils'
import { File, nextBuild, nextExport, runNextCommand } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const access = promisify(fs.access)
const readFile = promisify(fs.readFile)
const appDir = join(__dirname, '../')
const outDir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))

describe('AMP Validation on Export', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    await nextExport(appDir, { outdir: outDir })
  })

  it('should export AMP pages', async () => {
    const toCheck = ['first', 'second', 'third.amp']
    await Promise.all(
      toCheck.map(async page => {
        const content = await readFile(join(outDir, `${page}/index.html`))
        await validateAMP(content.toString())
      })
    )
  })

  it('shows AMP warning without throwing error', async () => {
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
      expect(stdout).toMatch(
        /warn.*The tag 'amp-video extension \.js script' is missing/
      )
      await expect(access(join(outDir, 'cat/index.html'))).resolves.toBe(
        undefined
      )
      await expect(stderr).not.toMatch(
        /Found conflicting amp tag "meta" with conflicting prop name="viewport"/
      )
    } finally {
      nextConfig.restore()
    }
  })

  it('throws error on AMP error', async () => {
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
      expect(stdout).toMatch(
        /error.*The tag 'img' may only appear as a descendant of tag 'noscript'. Did you mean 'amp-img'\?/
      )
      await expect(access(join(outDir, 'dog/index.html'))).resolves.toBe(
        undefined
      )
      await expect(stderr).not.toMatch(
        /Found conflicting amp tag "meta" with conflicting prop name="viewport"/
      )
    } finally {
      nextConfig.restore()
    }
  })

  it('shows warning and error when throwing error', async () => {
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
      expect(stdout).toMatch(
        /warn.*The tag 'amp-video extension \.js script' is missing/
      )
      expect(stdout).toMatch(
        /error.*The tag 'img' may only appear as a descendant of tag 'noscript'. Did you mean 'amp-img'\?/
      )
      await expect(access(join(outDir, 'dog-cat/index.html'))).resolves.toBe(
        undefined
      )
      await expect(stderr).not.toMatch(
        /Found conflicting amp tag "meta" with conflicting prop name="viewport"/
      )
    } finally {
      nextConfig.restore()
    }
  })
})
