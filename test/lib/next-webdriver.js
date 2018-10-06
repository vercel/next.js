import wd from 'wd'

export default async function (appPort, pathname) {
  if (typeof appPort === 'undefined') {
    throw new Error('appPort is undefined')
  }
  const url = `http://localhost:${appPort}${pathname}`
  const browser = wd.promiseChainRemote('http://localhost:9515/')
  await browser.init({ browserName: 'chrome' })
  await browser.get(url)
  return browser
}
