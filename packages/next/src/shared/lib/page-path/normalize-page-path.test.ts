import { normalizePagePath } from './normalize-page-path'

describe('normalizePagePath', () => {
  it('should normalize the page path', () => {
    expect(normalizePagePath('/')).toBe('/index')
  })

  it('should normalize the page path with a dynamic route', () => {
    expect(normalizePagePath('/[locale]')).toBe('/[locale]')
  })

  it('should normalize the page path with a dynamic route and a trailing slash', () => {
    expect(normalizePagePath('/[locale]/')).toBe('/[locale]/')
  })

  it('should normalize the page with a leading index', () => {
    expect(normalizePagePath('/index')).toBe('/index/index')
  })

  it('should normalize the page with a leading index and suffix', () => {
    expect(normalizePagePath('/index/foo')).toBe('/index/index/foo')
  })
})
