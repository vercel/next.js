import type { NextRouter } from './router'
import { adaptForAppRouterInstance } from './adapters'

describe('adaptForAppRouterInstance', () => {
  beforeEach(() => jest.resetAllMocks())

  const router = {
    back: jest.fn(),
    forward: jest.fn(),
    reload: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  } as unknown as NextRouter

  const adapter = adaptForAppRouterInstance(router)

  it('should forward a call to `back()`', () => {
    adapter.back()
    expect(router.back).toHaveBeenCalled()
  })

  it('should forward a call to `forward()`', () => {
    adapter.forward()
    expect(router.forward).toHaveBeenCalled()
  })

  it('should forward a call to `reload()`', () => {
    adapter.refresh()
    expect(router.reload).toHaveBeenCalled()
  })

  it('should forward a call to `push()`', () => {
    adapter.push('/foo')
    expect(router.push).toHaveBeenCalledWith('/foo', undefined, {
      scroll: undefined,
    })
  })

  it('should forward a call to `push()` with options', () => {
    adapter.push('/foo', { scroll: false })
    expect(router.push).toHaveBeenCalledWith('/foo', undefined, {
      scroll: false,
    })
  })

  it('should forward a call to `replace()`', () => {
    adapter.replace('/foo')
    expect(router.replace).toHaveBeenCalledWith('/foo', undefined, {
      scroll: undefined,
    })
  })

  it('should forward a call to `replace()` with options', () => {
    adapter.replace('/foo', { scroll: false })
    expect(router.replace).toHaveBeenCalledWith('/foo', undefined, {
      scroll: false,
    })
  })

  it('should forward a call to `prefetch()`', () => {
    adapter.prefetch('/foo')
    expect(router.prefetch).toHaveBeenCalledWith('/foo')
  })
})
