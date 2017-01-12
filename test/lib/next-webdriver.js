import wd from 'wd'

export default async function (appPort, pathname) {
  const url = `http://localhost:${appPort}${pathname}`

  const browser = wd.promiseChainRemote('http://localhost:9515/')
  await browser.init({browserName: 'chrome'}).get(url)

  return browser
}
