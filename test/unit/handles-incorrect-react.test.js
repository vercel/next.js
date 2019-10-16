/* global fixture, test */
import 'testcafe'
import path from 'path'
import { didThrow } from 'next-test-utils'

const nextDir = path.dirname(require.resolve('next/package'))
const nextBin = path.join(nextDir, 'dist/bin/next')
const reactKey = require.resolve('react')
require('react')

fixture('Handles Incorrect React Version').after(() => {
  delete require.cache[reactKey]
})

test('should throw an error when building with next', async t => {
  require.cache[reactKey].exports.Suspense = undefined

  await didThrow(
    () => require(nextBin),
    true,
    /The version of React you are using is lower than the minimum required version needed for Next\.js\. Please upgrade "react" and "react-dom": "npm install --save react react-dom" https:\/\/err\.sh/
  )
})
