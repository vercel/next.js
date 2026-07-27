import { ReadonlyURLSearchParams } from './navigation'

describe('next/navigation', () => {
  it('should be able to construct URLSearchParams from ReadonlyURLSearchParams', () => {
    const searchParams = new URLSearchParams('?foo=test&bar=test')
    const readonlySearchParams = new ReadonlyURLSearchParams(searchParams)
    expect(() => new URLSearchParams(readonlySearchParams)).not.toThrow()
  })
})
