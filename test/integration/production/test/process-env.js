/* eslint-env jest */
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  readNextBuildClientPageFile,
  readNextBuildServerPageFile,
} from 'next-test-utils'

const appDir = join(__dirname, '..')

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
      const clientCode = await readNextBuildClientPageFile(
        appDir,
        '/process-env'
      )
      expect(clientCode).toMatch(
        /__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__/
      )
      expect(clientCode).not.toMatch(
        /__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__/
      )
    })

    it('should eliminate client only code on the server', async () => {
      const serverCode = await readNextBuildServerPageFile(
        appDir,
        '/process-env'
      )
      expect(serverCode).not.toMatch(
        /__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__/
      )
      expect(serverCode).toMatch(
        /__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__/
      )
    })
  })
}
