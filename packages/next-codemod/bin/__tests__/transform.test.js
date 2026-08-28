const { jscodeshiftExtensions } = require('../transform')

describe('transform runner', () => {
  it('includes JavaScript module config extensions', () => {
    expect(jscodeshiftExtensions).toEqual([
      'tsx',
      'ts',
      'jsx',
      'js',
      'mjs',
      'cjs',
    ])
  })
})
