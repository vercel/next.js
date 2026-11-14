jest.mock('../../packages/next/src/server/node-environment', () => {
  throw new Error(
    'SWC options must not import the server runtime environment'
  )
})

describe('SWC options module dependencies', () => {
  it('does not import the server runtime environment', () => {
    jest.isolateModules(() => {
      expect(() => {
        require('../../packages/next/src/build/swc/options')
      }).not.toThrow()
    })
  })
})
