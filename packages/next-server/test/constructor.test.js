/* eslint-env jest */

const { join } = require('path')
const createServer = require('../')

const dir = join(__dirname, 'app')

describe('Server#constructor', () => {
  describe('with default config', () => {
    it('sets .next as default destDir', () => {
      const server = createServer({ dir })
      expect(server.distDir).toBe(join(dir, '.next'))
    })

    it('reads buildId from .next/BUILD_ID', () => {
      const server = createServer({ dir })
      expect(server.buildId).toBe('test')
    })

    it('can receive custom distDir through programmatic api', () => {
      const server = createServer({ dir, conf: { distDir: 'build' } })
      expect(server.buildId).toBe('custom2')
    })
  })
})
