/* eslint-env jest */
import path from 'path'

jest.mock('react', () => ({
  Suspense: undefined,
}))

const nextDir = path.dirname(require.resolve('next/package'))
const nextBin = path.join(nextDir, 'dist/bin/next')

describe('Handles Incorrect React Version', () => {
  it('should throw an error when building with next', async () => {
    expect(() => require(nextBin)).toThrow(
      /The version of React you are using is lower than the minimum required version needed for Next\.js\. Please upgrade "react" and "react-dom": "npm install react react-dom" https:\/\/err\.sh/
    )
  })
})
