import { BasePathPathnameNormalizer } from './base-path'

describe('BasePathPathnameNormalizer', () => {
  it('should throw when provided with a blank basePath', () => {
    expect(() => new BasePathPathnameNormalizer('')).toThrow()
  })

  it('should throw when provided with a basePath of "/"', () => {
    expect(() => new BasePathPathnameNormalizer('/')).toThrow()
  })
})
