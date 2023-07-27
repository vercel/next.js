import { ReadonlyURLSearchParams } from './navigation'

describe('next/navigation', () => {
  it('should be able to construct ReadonlyURLSearchParams from URLSearchParams', () => {
    const searchParams = new URLSearchParams('?foo=test&bar=test')
    expect(() => new ReadonlyURLSearchParams(searchParams)).not.toThrow()
  })
})
