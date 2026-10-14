import { createRoute } from '../../shared/lib/route-types'
import { toRoute } from './to-route'

describe('toRoute Function', () => {
  it('should remove trailing slash', () => {
    const result = toRoute(createRoute('/example/'))
    expect(result).toBe('/example')
  })

  it('should remove trailing `/index`', () => {
    const result = toRoute(createRoute('/example/index'))
    expect(result).toBe('/example')
  })

  it('should return `/` when input is `/index`', () => {
    const result = toRoute(createRoute('/index'))
    expect(result).toBe('/')
  })

  it('should return `/` when input is `/index/`', () => {
    const result = toRoute(createRoute('/index/'))
    expect(result).toBe('/')
  })

  it('should return `/` when input is only a slash', () => {
    const result = toRoute(createRoute('/'))
    expect(result).toBe('/')
  })

  it('should return `/` when input is empty', () => {
    // Deliberately malformed transport input to retain coverage of the runtime fallback.
    const result = toRoute(createRoute(''))
    expect(result).toBe('/')
  })
})
