import webdriver from 'selenium-webdriver'

export const By = webdriver.By
export const Until = webdriver.until

export default async function (appPort, pathname) {
  const driver = new webdriver.Builder()
    .forBrowser('chrome')
    .build()

  const url = `http://localhost:${appPort}${pathname}`
  await driver.get(url)
  await driver.sleep(5000)

  return driver
}
