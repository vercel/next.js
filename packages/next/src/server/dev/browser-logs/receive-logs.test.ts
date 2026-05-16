import { stripFormatSpecifiers } from './receive-logs'

describe('stripFormatSpecifiers', () => {
  it('should only process when first arg is string containing %', () => {
    expect(stripFormatSpecifiers([])).toEqual([])
    expect(stripFormatSpecifiers([123])).toEqual([123])
    expect(stripFormatSpecifiers(['no percent'])).toEqual(['no percent'])
  })

  it('should replace format specifiers with their arguments', () => {
    expect(stripFormatSpecifiers(['%s', 'string'])).toEqual(['string'])
    expect(stripFormatSpecifiers(['Hello %s', 'world'])).toEqual([
      'Hello world',
    ])

    expect(stripFormatSpecifiers(['%d', 42])).toEqual(['42'])
    expect(stripFormatSpecifiers(['%i', 123])).toEqual(['123'])
    expect(stripFormatSpecifiers(['%f', 3.14])).toEqual(['3.14'])

    expect(stripFormatSpecifiers(['%o', { a: 1 }])).toEqual(['{ a: 1 }'])
    expect(stripFormatSpecifiers(['%O', { a: 1 }])).toEqual(['{ a: 1 }'])
    expect(stripFormatSpecifiers(['%j', { a: 1 }])).toEqual(['{ a: 1 }'])
  })

  it('should strip CSS styling from %c format specifier', () => {
    expect(stripFormatSpecifiers(['%c', 'css'])).toEqual([''])
    expect(stripFormatSpecifiers(['%cStyled text', 'color: red'])).toEqual([
      'Styled text',
    ])
    expect(
      stripFormatSpecifiers(['%cError: %s', 'color: red', 'Something failed'])
    ).toEqual(['Error: Something failed'])

    expect(
      stripFormatSpecifiers(['%cRed %cBlue', 'color: red', 'color: blue'])
    ).toEqual(['Red Blue'])

    expect(
      stripFormatSpecifiers([
        '%cDownload the React DevTools for a better development experience: https://react.dev/link/react-devtools',
        'font-weight:bold',
      ])
    ).toEqual([
      'Download the React DevTools for a better development experience: https://react.dev/link/react-devtools',
    ])

    expect(
      stripFormatSpecifiers([
        '%cStyled %s text %d',
        'color: red',
        'interpolated',
        42,
      ])
    ).toEqual(['Styled interpolated text 42'])
  })

  it('should handle escaped percent signs', () => {
    expect(stripFormatSpecifiers(['%%'])).toEqual(['%'])
    expect(stripFormatSpecifiers(['100%%', 'unused'])).toEqual([
      '100%',
      'unused',
    ])
  })

  it('should preserve excess arguments after all specifiers consumed', () => {
    expect(stripFormatSpecifiers(['%s', 'used', 'excess1', 'excess2'])).toEqual(
      ['used', 'excess1', 'excess2']
    )
  })

  it('should handle % at end of string', () => {
    expect(stripFormatSpecifiers(['ends with %'])).toEqual(['ends with %'])
  })
})
