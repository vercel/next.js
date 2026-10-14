import { createPage } from '../route-types'
import { normalizePagePath } from './normalize-page-path'

describe('normalizePagePath', () => {
  it('should normalize the page path', () => {
    expect(normalizePagePath(createPage('/'))).toBe('/index')
  })

  it('should normalize the page path with a dynamic route', () => {
    expect(normalizePagePath(createPage('/[locale]'))).toBe('/[locale]')
  })

  it('should normalize the page path with a dynamic route and a trailing slash', () => {
    expect(normalizePagePath(createPage('/[locale]/'))).toBe('/[locale]/')
  })

  it('should normalize the page with a leading index', () => {
    expect(normalizePagePath(createPage('/index'))).toBe('/index/index')
  })

  it('should normalize the page with a leading index and suffix', () => {
    expect(normalizePagePath(createPage('/index/foo'))).toBe('/index/index/foo')
  })
})
