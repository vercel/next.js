import wd from 'wd'

export default async function (appPort, pathname) {
  const url = `http://localhost:${appPort}${pathname}`
  console.warn(`> Start loading browser with url: ${url}`)

  for (let lc = 0; lc < 5; lc++) {
    try {
      const browser = await getBrowser(url, 5000)
      console.warn(`> Complete loading browser with url: ${url}`)
      return browser
    } catch (ex) {
      console.warn(`> Error when loading browser with url: ${url}`)
      if (ex.message === 'TIMEOUT') continue
      throw ex
    }
  }

  console.warn(`> Tried 5 times. Cannot load the browser for url: ${url}`)
  throw new Error(`Couldn't start the browser for url: ${url}`)
}

function getBrowser (url, timeout) {
  const browser = wd.promiseChainRemote('http://localhost:9515/')

  return new Promise((resolve, reject) => {
    let timeouted = false
    const timeoutHandler = setTimeout(() => {
      timeouted = true
      const error = new Error('TIMEOUT')
      reject(error)
    }, timeout)

    browser.init({browserName: 'chrome'}).get(url, (err) => {
      if (timeouted) {
        browser.close()
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
