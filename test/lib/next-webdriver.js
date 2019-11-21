import wd from 'wd'
import getPort from 'get-port'
import waitPort from 'wait-port'

const doHeadless = process.env.HEADLESS !== 'false'
let driverPort = 9515

let webdriver = async function(appPort, pathname) {
  if (typeof appPort === 'undefined') {
    throw new Error('appPort is undefined')
  }

  const url = `http://localhost:${appPort}${pathname}`
  console.log(`> Start loading browser with url: ${url}`)

  // Sometimes browser won't initialize due to some random issues.
  // So, we need to timeout the initialization and retry again.
  for (let lc = 0; lc < 5; lc++) {
    try {
      const browser = await getBrowser(url, 5000)
      console.log(`> Complete loading browser with url: ${url}`)
      return browser
    } catch (ex) {
      console.warn(`> Error when loading browser with url: ${url}`)

      // Try restarting chromedriver max twice
      if (lc < 2) {
        const chromedriver = require('chromedriver')
        console.log('Trying to restart chromedriver with random port')
        driverPort = await getPort()
        chromedriver.stop()
        chromedriver.start([`--port=${driverPort}`])
        // https://github.com/giggio/node-chromedriver/issues/117
        await waitPort({
          port: driverPort,
          timeout: 1000 * 30, // 30 seconds
        })
        continue
      }

      if (ex.message === 'TIMEOUT') continue
      throw ex
    }
  }

  console.error(`> Tried 5 times. Cannot load the browser for url: ${url}`)
  throw new Error(`Couldn't start the browser for url: ${url}`)
}

function getBrowser(url, timeout) {
  const browser = wd.promiseChainRemote(`http://localhost:${driverPort}/`)

  return new Promise((resolve, reject) => {
    let timeouted = false
    const timeoutHandler = setTimeout(() => {
      timeouted = true
      const error = new Error('TIMEOUT')
      reject(error)
    }, timeout)

    browser
      .init({
        browserName: 'chrome',
        ...(doHeadless
          ? {
              chromeOptions: { args: ['--headless'] },
            }
          : {}),
      })
      .get(url, err => {
        if (timeouted) {
          try {
            browser.close(() => {
              // Ignore errors
            })
          } catch (err) {
            // Ignore
          }
          return
        }

        clearTimeout(timeoutHandler)

        if (err) {
          reject(err)
          return
        }

        resolve(browser)
      })
  })
}

if (global.isBrowserStack) {
  webdriver = (...args) => global.bsWd(...args)
}
export default webdriver
