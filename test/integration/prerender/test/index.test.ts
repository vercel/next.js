/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
  retry,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')
let app
let appPort

describe('SSG Prerender', () => {
  describe('development mode getStaticPaths', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        // we set cpus to 1 so that we make sure the requests
        // aren't being cached at the jest-worker level
        `module.exports = { experimental: { cpus: 1 } }`
      )
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      try {
        await fs.remove(nextConfigPath)
        await killApp(app)
      } catch (err) {
        console.error(err)
      }
    })

    it('should work with firebase import and getStaticPaths', async () => {
      const html = await renderViaHTTP(appPort, '/blog/post-1')
      expect(html).toContain('post-1')
      expect(html).not.toContain('Error: Failed to load')

      const html2 = await renderViaHTTP(appPort, '/blog/post-1')
      expect(html2).toContain('post-1')
      expect(html2).not.toContain('Error: Failed to load')
    })

    it('should not cache getStaticPaths errors', async () => {
      const errMsg = /The `fallback` key must be returned from getStaticPaths/
      await retry(
        async () => {
          await expect(renderViaHTTP(appPort, '/blog/post-1')).resolves.toMatch(
            /post-1/
          )
        },
        30000,
        1000
      )

      const blogPage = join(appDir, 'pages/blog/[post]/index.js')
      const origContent = await fs.readFile(blogPage, 'utf8')
      await fs.writeFile(
        blogPage,
        origContent.replace('fallback: true,', '/* fallback: true, */')
      )

      try {
        await retry(
          async () => {
            await expect(
              renderViaHTTP(appPort, '/blog/post-1')
            ).resolves.toMatch(errMsg)
          },
          30000,
          1000
        )

        await fs.writeFile(blogPage, origContent)
        await retry(
          async () => {
            await expect(
              renderViaHTTP(appPort, '/blog/post-1')
            ).resolves.toMatch(/post-1/)
          },
          30000,
          1000
        )
      } finally {
        await fs.writeFile(blogPage, origContent)
      }
    })
  })
})
