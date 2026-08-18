/**
 * @jest-environment node
 */

import {
  createPrerenderInterruptedError,
  isPrerenderInterruptedError,
} from './dynamic-rendering'

describe('createPrerenderInterruptedError', () => {
  it('is recognized by isPrerenderInterruptedError and does not keep V8 frames', () => {
    const error = createPrerenderInterruptedError(
      'Route / needs to bail out of prerendering at this point because it used Date.now().'
    )

    expect(isPrerenderInterruptedError(error)).toBe(true)
    expect(error.name).toBe('Error')
    // Assignment materializes the stack as name + message only, dropping the
    // CallSite frames that would retain the creating closure / render graph.
    expect(error.stack).toBe(`${error.name}: ${error.message}`)
    expect(error.stack).not.toMatch(/\n\s+at /)
  })
})
