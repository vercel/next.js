/* eslint-env jest */

import { promises } from 'fs'
import { join } from 'path'
import { File, nextBuild, runNextCommand } from 'next-test-utils'
import { existsSync } from 'fs-extra'

const { access } = promises
const appDir = join(__dirname, '../')
const outDir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))

let buildOutput

describe('AMP Validation on Export', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      const { stdout = '', stderr = '' } = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      buildOutput = stdout + stderr
    })

    it('should have shown errors during build', async () => {
      expect(buildOutput).toMatch(
        /error.*The mandatory attribute 'height' is missing in tag 'amp-video'\./
      )
      expect(existsSync(outDir)).toBeFalse()
    })

    // this is now an error instead of a warning
    it.skip('shows AMP warning without throwing error', async () => {
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

    // img instead of amp-img no longer shows a warning
    it.skip('throws error on AMP error', async () => {
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

    // img instead of amp-img no longer shows a warning
    it.skip('shows warning and error when throwing error', async () => {
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
})
