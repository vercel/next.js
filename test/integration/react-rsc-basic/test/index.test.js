/* eslint-env jest */

import cheerio from 'cheerio'
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

  it('should have clientInfo in middleware manifest', async () => {
    const middlewareManifestPath = join(
      distDir,
      'server',
      'middleware-manifest.json'
    )
    const content = JSON.parse(
      await fs.readFile(middlewareManifestPath, 'utf8')
    )
    expect(content.clientInfo).toEqual([
      ['/', true],
      ['/next-api/image', true],
      ['/next-api/link', true],
      ['/routes/[dynamic]', true],
    ])
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

    // dynamic routes
    const dynamicRouteHTML1 = await renderViaHTTP(
      context.appPort,
      '/routes/dynamic1'
    )
    const dynamicRouteHTML2 = await renderViaHTTP(
      context.appPort,
      '/routes/dynamic2'
    )

    expect(homeHTML).toContain('thisistheindexpage.server')
    expect(homeHTML).toContain('foo.client')

    expect(dynamicRouteHTML1).toContain('[pid]')
    expect(dynamicRouteHTML2).toContain('[pid]')
  })

  it('should suspense next/link on server side', async () => {
    const linkHTML = await renderViaHTTP(context.appPort, '/next-api/link')
    const $ = cheerio.load(linkHTML)
    const linkText = $('div[hidden] > a[href="/"]').text()

    expect(linkText).toContain('go home')
  })

  it('should suspense next/image on server side', async () => {
    const imageHTML = await renderViaHTTP(context.appPort, '/next-api/image')
    const $ = cheerio.load(imageHTML)
    const imageTag = $('div[hidden] > span > span > img')

    expect(imageTag.attr('src')).toContain('data:image')
  })
}
