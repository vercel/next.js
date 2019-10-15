/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'
import { readFile } from 'fs'
import { promisify } from 'util'
import { join } from 'path'

const readFileAsync = promisify(readFile)
const readNextBuildFile = relativePath =>
  readFileAsync(join(__dirname, '../.next', relativePath), 'utf8')

export default () => {
  test('should set process.env.NODE_ENV in production', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/process-env')
    const nodeEnv = await browser.elementByCss('#node-env').text()
    await t.expect(nodeEnv).eql('production')
    await browser.close()
  })

  test('should eliminate server only code on the client', async t => {
    const buildId = await readNextBuildFile('./BUILD_ID')
    const clientCode = await readNextBuildFile(
      `./static/${buildId}/pages/process-env.js`
    )
    await t
      .expect(clientCode)
      .match(/__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__/)
    await t
      .expect(clientCode)
      .notMatch(/__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__/)
  })

  test('should eliminate client only code on the server', async t => {
    const buildId = await readNextBuildFile('./BUILD_ID')
    const serverCode = await readNextBuildFile(
      `./server/static/${buildId}/pages/process-env.js`
    )
    await t
      .expect(serverCode)
      .notMatch(/__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__/)
    await t
      .expect(serverCode)
      .match(/__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__/)
  })
}
