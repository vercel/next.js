import { toRoute } from './to-route'

describe('toRoute Function', () => {
  it('should remove trailing slash', () => {
    const result = toRoute('/example/')
    expect(result).toBe('/example')
  })

  it('should remove trailing `/index`', () => {
    const result = toRoute('/example/index')
    expect(result).toBe('/example')
  })

  it('should return `/` when input is `/index`', () => {
    const result = toRoute('/index')
    expect(result).toBe('/')
  })

  it('should return `/` when input is `/index/`', () => {
    const result = toRoute('/index/')
    expect(result).toBe('/')
  })

  it('should return `/` when input is only a slash', () => {
    const result = toRoute('/')
    expect(result).toBe('/')
  })

  it('should return `/` when input is empty', () => {
    const result = toRoute('')
    expect(result).toBe('/')
  })
})
