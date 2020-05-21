/* eslint-env jest */

import fs from 'fs-extra'
import path from 'path'
import { nextBuild } from 'next-test-utils'
import escapeStringRegexp from 'escape-string-regexp'

jest.setTimeout(1000 * 60 * 1)

const appDir = path.join(__dirname, '../app')
let buildId

describe('externalize next/dist/next-server', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    buildId = await fs.readFile(path.join(appDir, '.next/BUILD_ID'), 'utf8')
  })

  it('Does not bundle next/dist/next-server/lib/head.js in _error', async () => {
    const content = await fs.readFile(
      path.join(appDir, '.next/server/static', buildId, 'pages/_error.js'),
      'utf8'
    )
    expect(content).toMatch(
      new RegExp(
        '^' +
          escapeStringRegexp(
            `module.exports = require("next/dist/next-server/lib/head.js");`
          ) +
          '$',
        'm'
      )
    )
  })
})
