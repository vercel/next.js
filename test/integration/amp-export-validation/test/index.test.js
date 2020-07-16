/* eslint-env jest */

import { promises } from 'fs'
import { join } from 'path'
import { validateAMP } from 'amp-test-utils'
import { File, nextBuild, nextExport, runNextCommand } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const { access, readFile } = promises
const appDir = join(__dirname, '../')
const outDir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))

let buildOutput

describe('AMP Validation on Export', () => {
  beforeAll(async () => {
    const { stdout = '', stderr = '' } = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
    await nextExport(appDir, { outdir: outDir }, { ignoreFail: true })
    buildOutput = stdout + stderr
  })

  it('should have shown errors during build', async () => {
    expect(buildOutput).toMatch(
      /error.*The parent tag of tag 'img' is 'div', but it can only be 'i-amphtml-sizer-intrinsic'\./
    )
  })

  it('should export AMP pages', async () => {
    const toCheck = ['first', 'second', 'third.amp']
    await Promise.all(
      toCheck.map(async (page) => {
        const content = await readFile(join(outDir, `${page}.html`))
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
        stderr: true,
      })
      expect(stdout).toMatch(
        /error.*The mandatory attribute 'height' is missing in tag 'amp-video'\./
      )
      await expect(access(join(outDir, 'cat.html'))).resolves.toBe(undefined)
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
        stderr: true,
      })
      expect(stdout).toMatch(
        /error.*The parent tag of tag 'img' is 'div', but it can only be 'i-amphtml-sizer-intrinsic'\./
      )
      await expect(access(join(outDir, 'dog.html'))).resolves.toBe(undefined)
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
        stderr: true,
      })
      expect(stdout).toMatch(
        /error.*The parent tag of tag 'img' is 'div', but it can only be 'i-amphtml-sizer-intrinsic'\./
      )
      await expect(access(join(outDir, 'dog-cat.html'))).resolves.toBe(
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
