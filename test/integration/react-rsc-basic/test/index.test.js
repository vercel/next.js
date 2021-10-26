/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'

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

describe('RSC basic', () => {
  const context = { appDir }
  it('should warn user for experimental risk with server components', async () => {
    const middlewareWarning = `Using the experimental web runtime.`
    const rscWarning = `You have experimental React Server Components enabled.`
    const { stdout } = await nextBuild(context.appDir)
    expect(stdout).toContain(rscWarning)
    expect(stdout).toContain(middlewareWarning)
  })
})

describe('RSC prod', () => {
  const context = { appDir }

  beforeAll(async () => {
    context.appPort = await findPort()
    await nextBuild(context.appDir)
    context.server = await nextStart(context.appDir, context.appPort)
  })
  afterAll(async () => {
    await killApp(context.server)
  })

  it('should generate rsc middleware manifests', async () => {
    const distServerDir = join(distDir, 'server')
    const hasFile = (filename) => fs.existsSync(join(distServerDir, filename))

    const files = [
      'middleware-build-manifest.js',
      'middleware-flight-manifest.js',
      'middleware-ssr-runtime.js',
      'middleware-manifest.json',
    ]
    files.forEach((file) => {
      expect(hasFile(file)).toBe(true)
    })
  })

  runTests(context)
})

describe('RSC dev', () => {
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
  it('should render the correct html', async () => {
    const homeHTML = await renderViaHTTP(context.appPort, '/')
    const linkHTML = await renderViaHTTP(context.appPort, '/next-api/link')
    expect(homeHTML).toContain('thisistheindexpage.server')
    expect(homeHTML).toContain('foo.client')
    expect(linkHTML).toContain('go home')
  })
}
