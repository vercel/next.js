import { useIntersection } from './use-intersection'
// eslint-disable-next-line import/no-extraneous-dependencies
import { renderHook } from '@testing-library/react-hooks'

describe('useIntersection', () => {
  const createElement = () => ({ tagName: 'div' } as Element)
  const OriginalIntersectionObserver = global.IntersectionObserver
  const observe = jest.fn()
  const unobserve = jest.fn()
  beforeAll(() => {
    global.IntersectionObserver = jest.fn().mockReturnValue({
      observe,
      unobserve,
      disconnect: () => {},
    })
  })
  afterAll(() => {
    global.IntersectionObserver = OriginalIntersectionObserver
  })
  afterEach(() => {
    observe.mockReset()
    unobserve.mockReset()
  })
  it('should call observe whenever Element is passed', () => {
    const { result, unmount } = renderHook(() =>
      useIntersection({ rootMargin: '200px' })
    )
    expect(observe).not.toBeCalled()

    const [setElement] = result.current
    setElement(createElement())
    expect(observe).toBeCalledTimes(1)

    setElement(createElement())
    expect(observe).toBeCalledTimes(2)

    unmount()
  })
  it('should call unobserve when other Element is passed', () => {
    const { result, unmount } = renderHook(() =>
      useIntersection({ rootMargin: '200px' })
    )
    const [setElement] = result.current
    setElement(createElement())
    expect(unobserve).not.toBeCalled()

    setElement(createElement())
    expect(unobserve).toBeCalled()

    unmount()
  })
  it('should call unobserve when unmount', () => {
    const { result, unmount } = renderHook(() =>
      useIntersection({ rootMargin: '200px' })
    )
    const [setElement] = result.current
    setElement(createElement())
    unmount()
    expect(unobserve).toBeCalled()
  })
})
