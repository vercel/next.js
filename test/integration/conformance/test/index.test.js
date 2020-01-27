/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { killApp, nextBuild } from 'next-test-utils'

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
    console.log(build)
  })
})
