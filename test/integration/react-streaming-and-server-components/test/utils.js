import { join } from 'path'
import {
  File,
  launchApp,
  nextBuild as _nextBuild,
  nextStart as _nextStart,
} from 'next-test-utils'
import cheerio from 'cheerio'

const nodeArgs = []

export const appDir = join(__dirname, '../app')
export const nativeModuleTestAppDir = join(
  __dirname,
  '../unsupported-native-module'
)
export const distDir = join(__dirname, '../app/.next')
export const documentPage = new File(join(appDir, 'pages/_document.jsx'))
export const appPage = new File(join(appDir, 'pages/_app.js'))
export const appServerPage = new File(join(appDir, 'pages/_app.server.js'))
export const error500Page = new File(join(appDir, 'pages/500.js'))
export const nextConfig = new File(join(appDir, 'next.config.js'))

export async function nextBuild(dir, options) {
  return await _nextBuild(dir, [], {
    ...options,
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

export async function nextStart(dir, port) {
  return await _nextStart(dir, port, {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

export async function nextDev(dir, port) {
  return await launchApp(dir, port, {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

export function getNodeBySelector(html, selector) {
  const $ = cheerio.load(html)
  return $(selector)
}
