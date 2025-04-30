import { gone } from 'next/dist/client/components/gone'

describe('gone', () => {
  it('should throw an error with the correct digest', () => {
    expect(() => gone()).toThrow()
    try {
      gone()
    } catch (err: any) {
      // Use the actual format that's being produced
      expect(err.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;410')
    }
  })
})
