/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  File,
} from 'next-test-utils'

let appPort
let app
const appDir = join(__dirname, '..')

describe('MDX-rs Configuration', () => {
  describe('MDX-rs Plugin support', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(join(__dirname, '../'), appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })
    it('should render an MDX page correctly', async () => {
      expect(await renderViaHTTP(appPort, '/')).toMatch(/Hello MDX/)
    })

    it('should render an MDX page with component correctly', async () => {
      expect(await renderViaHTTP(appPort, '/button')).toMatch(/Look, a button!/)
    })

    it('should render an MDX page with globally provided components (from `mdx-components.js`) correctly', async () => {
      expect(await renderViaHTTP(appPort, '/provider')).toMatch(
        /Marker was rendered!/
      )
    })
  })

  describe('MDX-rs Plugin support with mdx transform options', () => {
    let nextConfig
    beforeAll(async () => {
      nextConfig = new File(join(appDir, 'next.config.js'))

      nextConfig.write(`
      const withMDX = require('@next/mdx')({
        extension: /\\.mdx?$/,
      })
      module.exports = withMDX({
        pageExtensions: ['js', 'jsx', 'mdx'],
        experimental: {
          mdxRs: {
            mdxType: 'gfm'
          },
        },
      })
    `)

      appPort = await findPort()
      app = await launchApp(join(__dirname, '../'), appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    it('should render an MDX page correctly', async () => {
      expect(await renderViaHTTP(appPort, '/gfm')).toMatch(
        /<table>\n<thead>\n<tr>\n<th>foo/
      )
    })
  })
})
