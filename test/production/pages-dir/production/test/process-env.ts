/* eslint-env jest */
import webdriver from 'next-webdriver'
import { getContentOfPageFilesFromBuildManifest } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'
import path from 'node:path'
import fs from 'fs-extra'

export default (next: NextInstance) => {
  describe('process.env', () => {
    it('should set process.env.NODE_ENV in production', async () => {
      const browser = await webdriver(next.appPort, '/process-env')
      const nodeEnv = await browser.elementByCss('#node-env').text()
      expect(nodeEnv).toBe('production')
      await browser.close()
    })
  })

  describe('process.browser', () => {
    it('should eliminate server only code on the client', async () => {
      const allClientCodeForPage = getContentOfPageFilesFromBuildManifest(
        next.testDir,
        '/process-env'
      )
      expect(allClientCodeForPage).toMatch(
        /__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__/
      )
      expect(allClientCodeForPage).not.toMatch(
        /__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__/
      )
    })

    it('should eliminate client only code on the server', async () => {
      let allServerCodeForPage = ''
      const chunksFilesDir = path.join(
        next.testDir,
        '.next',
        'server',
        'chunks'
      )
      const allFilesInDotNextServerChunks = await fs
        .readdirSync(chunksFilesDir, {
          recursive: true,
        })
        .filter((item) => item.toString().endsWith('.js'))
      for (const file of allFilesInDotNextServerChunks) {
        const content = await fs.readFile(
          path.join(chunksFilesDir, file.toString()),
          'utf8'
        )
        allServerCodeForPage += content
      }

      const pagesFilesDir = path.join(next.testDir, '.next', 'server', 'pages')
      const allFilesInDotNextServerPages = await fs
        .readdirSync(pagesFilesDir, {
          recursive: true,
        })
        .filter((item) => item.toString().endsWith('.js'))
      for (const file of allFilesInDotNextServerPages) {
        const content = await fs.readFile(
          path.join(pagesFilesDir, file.toString()),
          'utf8'
        )
        allServerCodeForPage += content
      }

      expect(allServerCodeForPage).not.toMatch(
        /__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__/
      )
      expect(allServerCodeForPage).toMatch(
        /__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__/
      )
    })
  })
}
