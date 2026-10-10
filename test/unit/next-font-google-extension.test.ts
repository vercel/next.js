/* eslint-env jest */

describe('font extension extraction regex', () => {
  const getFontExtension = (url: string): string => {
    return /\.(woff|woff2|eot|ttf|otf)(\?.*)?$/i.exec(url)?.[1] ?? 'woff2'
  }

  it('extracts woff2 extension from standard font URL', () => {
    expect(getFontExtension('https://fonts.gstatic.com/s/inter/v12/uc7.woff2')).toBe('woff2')
    expect(getFontExtension('https://fonts.gstatic.com/s/inter/v12/uc7.WOFF2')).toBe('WOFF2')
  })

  it('extracts extension when URL contains query parameters', () => {
    expect(getFontExtension('https://fonts.gstatic.com/s/inter/v12/uc7.woff2?v=123&foo=bar')).toBe('woff2')
    expect(getFontExtension('https://fonts.gstatic.com/s/inter/v12/uc7.ttf?v=1')).toBe('ttf')
  })

  it('defaults to woff2 when URL does not contain a standard font extension', () => {
    expect(getFontExtension('https://proxy.internal/font-file')).toBe('woff2')
    expect(getFontExtension('https://custom-cdn.com/assets/font?id=99114')).toBe('woff2')
  })
})
