import wd from 'wd'

export default async function (appPort, pathname) {
  console.warn(`> Start loading browser with path: ${pathname}`)
  const url = `http://localhost:${appPort}${pathname}`

  const browser = wd.promiseChainRemote('http://localhost:9515/')
  await browser.init({browserName: 'chrome'}).get(url)

  console.warn(`> Complete loading browser with path: ${pathname}`)
  return browser
}
