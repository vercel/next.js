/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

describe('Babel', () => {
  it.concurrent('should allow setting babelrc env', async () => {
    await nextBuild(join(__dirname, '../fixtures/babel-env'))
  })

  it.concurrent('should allow setting targets.browsers', async () => {
    await nextBuild(join(__dirname, '../fixtures/targets-browsers'))
  })

  it.concurrent('should allow setting targets to a string', async () => {
    await nextBuild(join(__dirname, '../fixtures/targets-string'))
  })

  it.concurrent('should allow babelrc JSON5 syntax', async () => {
    await nextBuild(join(__dirname, '../fixtures/babel-json5'))
  })
})
