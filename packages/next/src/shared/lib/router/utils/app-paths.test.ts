import { normalizeRscURL } from './app-paths'

describe('normalizeRscPath', () => {
  it('should normalize url with .rsc', () => {
    expect(normalizeRscURL('/test.rsc')).toBe('/test')
  })
  it('should normalize url with .rsc and searchparams', () => {
    expect(normalizeRscURL('/test.rsc?abc=def')).toBe('/test?abc=def')
  })
})
