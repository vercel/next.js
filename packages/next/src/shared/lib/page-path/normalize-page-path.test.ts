import type { Page } from '../route-types'
import { normalizePagePath } from './normalize-page-path'

describe('normalizePagePath', () => {
  it('should normalize the page path', () => {
    expect(normalizePagePath('/' as Page)).toBe('/index')
  })

  it('should normalize the page path with a dynamic route', () => {
    expect(normalizePagePath('/[locale]' as Page)).toBe('/[locale]')
  })

  it('should normalize the page path with a dynamic route and a trailing slash', () => {
    expect(normalizePagePath('/[locale]/' as Page)).toBe('/[locale]/')
  })

  it('should normalize the page with a leading index', () => {
    expect(normalizePagePath('/index' as Page)).toBe('/index/index')
  })

  it('should normalize the page with a leading index and suffix', () => {
    expect(normalizePagePath('/index/foo' as Page)).toBe('/index/index/foo')
  })
})
