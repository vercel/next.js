/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import path from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = path.join(__dirname, '../app')
let buildId

describe('typeof window replace', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    buildId = await fs.readFile(path.join(appDir, '.next/BUILD_ID'), 'utf8')
  })

  it('Replaces `typeof window` with object for client code', async () => {
    const content = await fs.readFile(
      path.join(appDir, '.next/static/', buildId, 'pages/index.js'),
      'utf8'
    )
    expect(content).toMatch(/Hello.*?,.*?("|')object("|')/)
  })

  it('Replaces `typeof window` with undefined for server code', async () => {
    const content = await fs.readFile(
      path.join(appDir, '.next/server/static', buildId, 'pages/index.js'),
      'utf8'
    )
    expect(content).toMatch(/Hello.*?,.*?("|')undefined("|')/)
  })

  it('Does not replace `typeof window` for `node_modules` code', async () => {
    const content = await fs.readFile(
      path.join(appDir, '.next/static/', buildId, 'pages/index.js'),
      'utf8'
    )
    expect(content).toMatch(/MyComp:.*?,.*?typeof window/)
  })
})
