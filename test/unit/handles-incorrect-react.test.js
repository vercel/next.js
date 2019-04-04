/* eslint-env jest */
import path from 'path'

jest.mock('react', () => ({
  Suspense: undefined
}))

const nextDir = path.dirname(require.resolve('next/package'))
const nextBin = path.join(nextDir, 'dist/bin/next')

describe('Handles Incorrect React Version', () => {
  it('should throw an error when building with next', async () => {
    expect(() => require(nextBin)).toThrow(/The version of React you are using doesn't appear to support 'Suspense'/)
  })
})
