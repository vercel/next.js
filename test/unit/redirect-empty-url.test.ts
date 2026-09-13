import { redirect } from '../../packages/next/src/client/components/redirect'

describe('redirect("") invariant', () => {
  it('should throw on empty string', () => {
    expect(() => redirect('')).toThrow(
      'Invariant: attempted to redirect to an empty URL'
    )
  })
})
