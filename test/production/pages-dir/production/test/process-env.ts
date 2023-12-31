/* eslint-env jest */
import webdriver from 'next-webdriver'
import {
  readNextBuildClientPageFile,
  readNextBuildServerPageFile,
} from 'next-test-utils'
import { NextInstance } from 'e2e-utils'

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
      const clientCode = await readNextBuildClientPageFile(
        next.testDir,
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
        next.testDir,
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
