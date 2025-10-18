/* eslint-env jest */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

describe('Router.replace with hash and query', () => {
  beforeAll(async () => {
    appPort = await findPort()
    await nextBuild(appDir)
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should re-run getInitialProps when query changes even with hash present', async () => {
    const browser = await webdriver(appPort, '/')
    
    // Verify initial query value
    const initialQuery = await browser.elementById('query-value').text()
    expect(initialQuery).toBe('test: undefined')

    // Get initial count of getInitialProps runs
    const initialRunCount = await browser.eval('window.__getInitialPropsRunCount')

    // Trigger Router.replace with hash and query
    await browser.elementById('trigger-query-hash-replace').click()

    // Wait for query to update
    await browser.waitForElementByCss('#query-value')
    const updatedQuery = await browser.elementById('query-value').text()
    expect(updatedQuery).toBe('test: 123')

    // Verify getInitialProps ran again
    const finalRunCount = await browser.eval('window.__getInitialPropsRunCount')
    expect(finalRunCount).toBe(initialRunCount + 1)
  })

  // Add test to verify the fix doesn't break pure hash changes
  it('should not re-run getInitialProps on hash-only changes', async () => {
    const browser = await webdriver(appPort, '/')
    
    // Get initial count
    const initialRunCount = await browser.eval('window.__getInitialPropsRunCount')
    
    // Update just the hash
    await browser.eval('window.location.hash = "#newhash"')
    
    // Small wait to ensure any potential getInitialProps would have run
    await new Promise((resolve) => setTimeout(resolve, 1000))
    
    // Verify count didn't change
    const finalRunCount = await browser.eval('window.__getInitialPropsRunCount')
    expect(finalRunCount).toBe(initialRunCount)
  })
})