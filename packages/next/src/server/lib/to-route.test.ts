import type { Route } from '../../shared/lib/route-types'
import { toRoute } from './to-route'

describe('toRoute Function', () => {
  it('should remove trailing slash', () => {
    const result = toRoute('/example/' as Route)
    expect(result).toBe('/example')
  })

  it('should remove trailing `/index`', () => {
    const result = toRoute('/example/index' as Route)
    expect(result).toBe('/example')
  })

  it('should return `/` when input is `/index`', () => {
    const result = toRoute('/index' as Route)
    expect(result).toBe('/')
  })

  it('should return `/` when input is `/index/`', () => {
    const result = toRoute('/index/' as Route)
    expect(result).toBe('/')
  })

  it('should return `/` when input is only a slash', () => {
    const result = toRoute('/' as Route)
    expect(result).toBe('/')
  })

  it('should return `/` when input is empty', () => {
    // Deliberately malformed transport input to retain coverage of the runtime fallback.
    const result = toRoute('' as Route)
    expect(result).toBe('/')
  })
})
