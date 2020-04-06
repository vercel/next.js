/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { killApp, nextBuild } from 'next-test-utils'
import chalk from 'chalk'

const appDir = join(__dirname, '../')
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('Conformance system', () => {
  let build
  beforeAll(async () => {
    build = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
  })
  afterAll(() => killApp(server))

  it('Should warn about sync external sync scripts', async () => {
    const { stderr } = build
    expect(stderr).toContain(
      '[BUILD CONFORMANCE WARNING]: A sync script was found in a react module.'
    )
  })

  it('Should warn about duplicate polyfills', async () => {
    const { stderr } = build
    expect(stderr).toContain(
      '[BUILD CONFORMANCE WARNING]: Found polyfill.io loading polyfill for fetch.'
    )
  })

  it('Should warn about changes to granularChunks config', async () => {
    const { stderr } = build
    expect(stderr).toContain(
      '[BUILD CONFORMANCE ERROR]: The splitChunks config as part of the granularChunks flag has ' +
        `been carefully crafted to optimize build size and build times. Please avoid changes to ${chalk.bold(
          'splitChunks.cacheGroups.vendors'
        )}`
    )
  })
})
