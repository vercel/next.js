/* eslint-env jest */
/* global jasmine */
import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const fixturesDir = join(__dirname, '../fixtures')

describe('Browserslist: Old', () => {
  const appDir = join(fixturesDir, 'browsers-old')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter(f => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(
      cssContent.replace(/\/\*.*?\*\//g, '').trim()
    ).toMatchInlineSnapshot()
  })
})

describe('Browserslist: New', () => {
  const appDir = join(fixturesDir, 'browsers-new')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter(f => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(
      cssContent.replace(/\/\*.*?\*\//g, '').trim()
    ).toMatchInlineSnapshot()
  })
})
