import { normalizeRscPath } from './app-paths'

describe('normalizeRscPath', () => {
  describe('enabled', () => {
    it('should normalize url with .rsc', () => {
      expect(normalizeRscPath('/test.rsc', true)).toBe('/test')
    })
    it('should normalize url with .rsc and searchparams', () => {
      expect(normalizeRscPath('/test.rsc?abc=def', true)).toBe('/test?abc=def')
    })
  })
  describe('disabled', () => {
    it('should normalize url with .rsc', () => {
      expect(normalizeRscPath('/test.rsc', false)).toBe('/test.rsc')
    })
    it('should normalize url with .rsc and searchparams', () => {
      expect(normalizeRscPath('/test.rsc?abc=def', false)).toBe(
        '/test.rsc?abc=def'
      )
    })
  })
})
