import { redirect } from '../../packages/next/src/client/components/redirect'

describe('redirect("") invariant', () => {
  it('should throw on empty string', () => {
    expect(() => redirect('')).toThrow(
      'Invariant: attempted to redirect to an empty URL'
    )
  })

  it('should throw on whitespace string', () => {
    expect(() => redirect('   ')).toThrow()
  })

  it('should NOT throw on valid url', () => {
    expect(() => redirect('/')).toThrow()
  })
})
