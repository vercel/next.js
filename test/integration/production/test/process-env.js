/* eslint-env jest */
/* global webdriver */
import { readFile } from 'fs'
import { promisify } from 'util'
import { join } from 'path'

const readFileAsync = promisify(readFile)
const readNextBuildFile = (relativePath) => readFileAsync(join(__dirname, '../.next', relativePath), 'utf8')

export default (context) => {
  describe('process.env', () => {
    it('should set process.env.NODE_ENV in production', async () => {
      const browser = await webdriver(context.appPort, '/process-env')
      const nodeEnv = await browser.elementByCss('#node-env').text()
      expect(nodeEnv).toBe('production')
      await browser.close()
    })
  })

  describe('process.browser', () => {
    it('should eliminate server only code on the client', async () => {
      const buildId = await readNextBuildFile('./BUILD_ID')
      const clientCode = await readNextBuildFile(`./static/${buildId}/pages/process-env.js`)
      expect(clientCode).toMatch(/__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__/)
      expect(clientCode).not.toMatch(/__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__/)
    })

    it('should eliminate client only code on the server', async () => {
      const buildId = await readNextBuildFile('./BUILD_ID')
      const serverCode = await readNextBuildFile(`./server/static/${buildId}/pages/process-env.js`)
      expect(serverCode).not.toMatch(/__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__/)
      expect(serverCode).toMatch(/__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__/)
    })
  })
}
