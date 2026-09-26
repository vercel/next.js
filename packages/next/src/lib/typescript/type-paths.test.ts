import { getTypeDefinitionGlobPatterns } from './type-paths'

describe('getTypeDefinitionGlobPatterns()', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV

  afterEach(() => {
    ;(process.env as any).NODE_ENV = ORIGINAL_NODE_ENV
  })

  it('includes both the build and the dev type directories', () => {
    expect(getTypeDefinitionGlobPatterns('.next')).toEqual([
      '.next/types/**/*.ts',
      '.next/dev/types/**/*.ts',
    ])
  })

  it('does not depend on NODE_ENV', () => {
    // `next dev` derives distDir from the build phase, but NODE_ENV is whatever
    // the shell had: `test` is a standard value the CLI preserves without
    // warning, and is commonly exported by test runners and by CI. Reading the
    // mode from it produced "{distDir}/dev/dev/types".
    for (const nodeEnv of ['development', 'production', 'test']) {
      ;(process.env as any).NODE_ENV = nodeEnv

      expect(getTypeDefinitionGlobPatterns('.next')).toEqual([
        '.next/types/**/*.ts',
        '.next/dev/types/**/*.ts',
      ])
    }
  })

  it('leaves a configured distDir that itself ends in "dev" intact', () => {
    expect(getTypeDefinitionGlobPatterns('build/dev')).toEqual([
      'build/dev/types/**/*.ts',
      'build/dev/dev/types/**/*.ts',
    ])
  })
})
