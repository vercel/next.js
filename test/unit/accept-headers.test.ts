import { acceptLanguage } from 'next/dist/server/accept-header'

describe('acceptLanguage', () => {
  it('parses the header', () => {
    const language = acceptLanguage('da, en-GB, en')
    expect(language).toEqual('da')
  })

  it('respects weights', () => {
    const language = acceptLanguage('en;q=0.6, en-GB;q=0.8')
    expect(language).toEqual('en-gb')
  })

  it('returns an empty string with header is empty', () => {
    const language = acceptLanguage('')
    expect(language).toEqual('')
  })

  it('returns empty string if header is missing', () => {
    const language = acceptLanguage()
    expect(language).toEqual('')
  })

  it('ignores an empty preferences array', () => {
    const language = acceptLanguage('da, en-GB, en', [])
    expect(language).toEqual('da')
  })

  it('returns empty string if none of the preferences match', () => {
    const language = acceptLanguage('da, en-GB, en', ['es'])
    expect(language).toEqual('')
  })

  it('returns first preference if header has * and is unmatched', () => {
    const language = acceptLanguage('da, en-GB, *', ['en-US'])
    expect(language).toEqual('en-US')
  })

  it('returns first found preference that header includes', () => {
    const language = acceptLanguage('da, en-GB, en', ['en-US', 'en-GB'])
    expect(language).toEqual('en-US')
  })

  it('returns preference with highest order when equal weigths', () => {
    expect(acceptLanguage('da, en, en-GB', ['en', 'en-GB'])).toEqual('en')
    expect(acceptLanguage('da, en, en-GB', ['en-GB', 'en'])).toEqual('en-GB')
    expect(acceptLanguage('en, en-GB, en-US')).toEqual('en')
  })

  it('return language with heighest weight', () => {
    const language = acceptLanguage('da;q=0.5, en;q=1', ['da', 'en'])
    expect(language).toEqual('en')
  })

  it('ignores preference case when matching', () => {
    const language = acceptLanguage('da, en-GB, en-us', ['en-gb', 'en-us']) // en-GB vs en-gb
    expect(language).toEqual('en-gb')
  })

  it('returns language using range match', () => {
    expect(acceptLanguage('da', ['da-DK'])).toEqual('da-DK')
    expect(acceptLanguage('en-US, en', ['en-GB', 'en-US'])).toEqual('en-GB')
    expect(acceptLanguage('da, en', ['da-DK', 'en-GB'])).toEqual('da-DK')
    expect(acceptLanguage('en, da', ['da-DK', 'en-GB'])).toEqual('da-DK')
    expect(acceptLanguage('en, da', ['en', 'en-GB'])).toEqual('en')
    expect(acceptLanguage('da, en-GB', ['da-DK', 'en-GB'])).toEqual('da-DK')
    expect(acceptLanguage('en, en-GB', ['en-US', 'en-GB', 'da-DK'])).toEqual(
      'en-US'
    )
  })

  it('explicit preference overrides range match', () => {
    expect(acceptLanguage('da, en-GB', ['da-DK', 'en-GB', 'da'])).toEqual(
      'en-GB'
    )
  })
})
