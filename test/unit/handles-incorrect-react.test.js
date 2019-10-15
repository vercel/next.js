/* global fixture, test */
import 'testcafe'
import path from 'path'
import mock from 'mock-require'
import { didThrow } from 'next-test-utils'

mock('react', {
  Suspense: undefined
})

const nextDir = path.dirname(require.resolve('next/package'))
const nextBin = path.join(nextDir, 'dist/bin/next')

fixture('Handles Incorrect React Version')

test('should throw an error when building with next', async t => {
  await didThrow(
    () => require(nextBin),
    true,
    /The version of React you are using is lower than the minimum required version needed for Next\.js\. Please upgrade "react" and "react-dom": "npm install --save react react-dom" https:\/\/err\.sh/
  )
})
