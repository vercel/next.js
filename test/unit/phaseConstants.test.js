/* eslint-env jest */
import {
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER
} from 'next/constants'

describe('phaseConstants', () => {
  it('should set phases correctly', () => {
    expect(PHASE_EXPORT).toBe('phase-export')
    expect(PHASE_PRODUCTION_BUILD).toBe('phase-production-build')
    expect(PHASE_PRODUCTION_SERVER).toBe('phase-production-server')
    expect(PHASE_DEVELOPMENT_SERVER).toBe('phase-development-server')
  })
})
