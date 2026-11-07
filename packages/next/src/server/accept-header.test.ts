import { acceptLanguage } from './accept-header'

describe('acceptLanguage', () => {
  it('drops languages with a zero weight', () => {
    expect(acceptLanguage('da;q=0, en;q=1', ['da', 'en'])).toEqual('en')
    expect(acceptLanguage('da;q=0.0, en;q=1', ['da', 'en'])).toEqual('en')
  })

  it('accepts weights at the valid range boundaries', () => {
    expect(acceptLanguage('en;q=0.001, da;q=1', ['en', 'da'])).toEqual('da')
    expect(acceptLanguage('en;q=1.0, da;q=0.5', ['en', 'da'])).toEqual('en')
  })

  it('ranks near-zero weights below valid ones', () => {
    expect(acceptLanguage('da;q=0.0001, en;q=1', ['da', 'en'])).toEqual('en')
  })

  it('rejects weights above the valid range', () => {
    expect(() => acceptLanguage('da;q=2, en;q=1')).toThrow()
    expect(() => acceptLanguage('da;q=1.5')).toThrow()
  })

  it('rejects non-numeric weights', () => {
    expect(() => acceptLanguage('da;q=abc')).toThrow()
    expect(() => acceptLanguage('da;q=NaN')).toThrow()
  })
})
