import { join } from 'path'
import { File } from 'next-test-utils'
import cheerio from 'cheerio'

export const appDir = join(__dirname, '../app')
export const nativeModuleTestAppDir = join(
  __dirname,
  '../unsupported-native-module'
)
export const appPage = new File(join(appDir, 'pages/_app.js'))
export const appServerPage = new File(join(appDir, 'pages/_app.server.js'))
export const error500Page = new File(join(appDir, 'pages/500.js'))
export const nextConfig = new File(join(appDir, 'next.config.js'))

export function getNodeBySelector(html, selector) {
  const $ = cheerio.load(html)
  return $(selector)
}
