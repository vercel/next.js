/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'
;(process.env.TURBOPACK ? describe.skip : describe)('Babel', () => {
  it('should allow setting babelrc env', async () => {
    await nextBuild(join(__dirname, '../fixtures/babel-env'))
  })

  it('should allow setting targets.browsers', async () => {
    await nextBuild(join(__dirname, '../fixtures/targets-browsers'))
  })

  it('should allow setting targets to a string', async () => {
    await nextBuild(join(__dirname, '../fixtures/targets-string'))
  })

  it('should allow babelrc JSON5 syntax', async () => {
    await nextBuild(join(__dirname, '../fixtures/babel-json5'))
  })
})
