/* eslint-env jest */
/* global jasmine */
import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import {
  File,
  nextBuild,
  runNextCommand
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const access = promisify(fs.access)
const appDir = join(__dirname, '../')
const outDir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))

describe('AMP Validation on Export', () => {
  beforeAll(() => nextBuild(appDir))

  it('shows AMP warning without throwing error', async () => {
    nextConfig.replace('// exportPathMap',
      `exportPathMap: function(defaultMap) {
      return {
        '/cat': defaultMap['/cat.amp'],
      }
    },`)

    let stdout = ''
    try {
      await runNextCommand(['export', appDir], {
        instance: child => {
          child.stdout.on('data', chunk => {
            stdout += chunk.toString()
          })
        }
      })
      expect(stdout).toMatch(/warn.*The tag 'amp-video extension \.js script' is missing/)
      await expect(access(join(outDir, 'cat/index.html'))).resolves.toBe(undefined)
    } finally {
      nextConfig.restore()
    }
  })

  it('throws error on AMP error', async () => {
    nextConfig.replace('// exportPathMap',
      `exportPathMap: function(defaultMap) {
      return {
        '/dog': defaultMap['/dog.amp'],
      }
    },`)

    let stdout = ''
    try {
      await runNextCommand(['export', appDir], {
        instance: child => {
          child.stdout.on('data', chunk => {
            stdout += chunk.toString()
          })
        }
      })
      expect(stdout).toMatch(/error.*The tag 'img' may only appear as a descendant of tag 'noscript'. Did you mean 'amp-img'\?/)
      await expect(access(join(outDir, 'dog/index.html'))).resolves.toBe(undefined)
    } finally {
      nextConfig.restore()
    }
  })

  it('shows warning and error when throwing error', async () => {
    nextConfig.replace('// exportPathMap',
      `exportPathMap: function(defaultMap) {
      return {
        '/dog-cat': defaultMap['/dog-cat.amp'],
      }
    },`)

    let stdout = ''
    try {
      await runNextCommand(['export', appDir], {
        instance: child => {
          child.stdout.on('data', chunk => {
            stdout += chunk.toString()
          })
        }
      })
      expect(stdout).toMatch(/warn.*The tag 'amp-video extension \.js script' is missing/)
      expect(stdout).toMatch(/error.*The tag 'img' may only appear as a descendant of tag 'noscript'. Did you mean 'amp-img'\?/)
      await expect(access(join(outDir, 'dog-cat/index.html'))).resolves.toBe(undefined)
    } finally {
      nextConfig.restore()
    }
  })
})
