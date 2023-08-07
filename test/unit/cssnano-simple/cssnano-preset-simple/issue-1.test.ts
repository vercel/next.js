import cssnanoPresetSimple from 'next/src/bundles/cssnano-simple/cssnano-preset-simple'

// https://github.com/Timer/cssnano-preset-simple/issues/1
describe('https://github.com/Timer/cssnano-preset-simple/issues/1', () => {
  test('evaluates without error', () => {
    cssnanoPresetSimple()
  })
})
