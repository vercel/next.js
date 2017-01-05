import webdriver from 'selenium-webdriver'
import { chromedriver } from 'alto-saxophone'
import { dirname } from 'path'

// Add chromedriver vendor locaation to the path
const sep = /^win/.test(process.platform) ? ';' : ':'
process.env.PATH = `${dirname(chromedriver.binPath())}${sep}${process.env.PATH}`

export const By = webdriver.By
export const Until = webdriver.until

export default async function (appPort, pathname) {
  const driver = new webdriver.Builder()
    .forBrowser('chrome')
    .build()

  // Wait for the page load event for maximum of 10 seconds.
  driver.manage().timeouts().pageLoadTimeout(1000 * 10)

  const url = `http://localhost:${appPort}${pathname}`
  await driver.get(url)

  return driver
}
