/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'

import {
  findPort,
  killApp,
  launchApp,
  nextBuild as _nextBuild,
  nextStart as _nextStart,
  renderViaHTTP,
} from 'next-test-utils'

const nodeArgs = ['-r', join(__dirname, '../../react-18/test/require-hook.js')]
const appDir = join(__dirname, '../app')
const distDir = join(__dirname, '../app/.next')

async function nextBuild(dir) {
  return await _nextBuild(dir, [], {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

async function nextStart(dir, port) {
  return await _nextStart(dir, port, {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

async function nextDev(dir, port) {
  return await launchApp(dir, port, {
    stdout: true,
    stderr: true,
    nodeArgs,
  })
}

describe('CSS import - prod', () => {
  const context = { appDir }

  beforeAll(async () => {
    context.appPort = await findPort()
    await nextBuild(context.appDir)
    context.server = await nextStart(context.appDir, context.appPort)
  })
  afterAll(async () => {
    await killApp(context.server)
  })

  runTests(context)
})

describe('CSS import - dev', () => {
  const context = { appDir }

  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await nextDev(context.appDir, context.appPort)
  })
  afterAll(async () => {
    await killApp(context.server)
  })
  runTests(context)
})

async function runTests(context) {
  it('should include global styles under `concurrentFeatures: true`', async () => {
    const browser = await webdriver(context.appPort, '/global-styles')
    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
  it('should include global styles with `serverComponents: true`', async () => {
    const browser = await webdriver(context.appPort, '/global-styles-rsc')
    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
  // TODO: fix this test
  // it.skip('should include css modules with `serverComponents: true`', async () => {
  //   const browser = await webdriver(context.appPort, '/css-modules')
  //   const currentColor = await browser.eval(
  //     `window.getComputedStyle(document.querySelector('h1')).color`
  //   )
  //   expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  // })
}
