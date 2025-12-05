import * as constantsExports from './constants'

describe('api/constants', () => {
  it('should export constants from shared/lib/constants', () => {
    // Verify the module exports something
    expect(constantsExports).toBeDefined()
    expect(typeof constantsExports).toBe('object')
  })

  it('should export PHASE_* constants', () => {
    // These are commonly used constants from shared/lib/constants
    expect(constantsExports).toHaveProperty('PHASE_PRODUCTION_BUILD')
    expect(constantsExports).toHaveProperty('PHASE_PRODUCTION_SERVER')
    expect(constantsExports).toHaveProperty('PHASE_DEVELOPMENT_SERVER')
  })

  it('should export exported constants as strings', () => {
    expect(typeof constantsExports.PHASE_PRODUCTION_BUILD).toBe('string')
    expect(typeof constantsExports.PHASE_PRODUCTION_SERVER).toBe('string')
    expect(typeof constantsExports.PHASE_DEVELOPMENT_SERVER).toBe('string')
  })
})
