/* eslint-env jest */
import path from 'path'
import { nextBuild, readNextBuildServerPageFile } from 'next-test-utils'
import escapeStringRegexp from 'escape-string-regexp'

jest.setTimeout(1000 * 60 * 1)

const appDir = path.join(__dirname, '../app')

describe('externalize next/dist/shared', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
  })

  it('Does not bundle next/dist/shared/lib/head.js in _error', async () => {
    const content = readNextBuildServerPageFile(appDir, '/_error')
    expect(content).toMatch(
      new RegExp(
        '^' +
          escapeStringRegexp(
            `module.exports = require("next/dist/shared/lib/head.js");`
          ) +
          ';?$',
        'm'
      )
    )
  })
})
