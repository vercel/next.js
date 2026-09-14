/**
 * @jest-environment jsdom
 */
/* eslint-disable import/no-extraneous-dependencies -- Not a prod file */
import { act, renderHook } from '@testing-library/react'
import { useDebouncedValue } from './use-debounced-value'

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300))
    expect(result.current).toBe('a')
  })

  it('does not update immediately when value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'b' })
    expect(result.current).toBe('a')
  })

  it('updates after the debounce delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'b' })
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(result.current).toBe('b')
  })

  it('resets the timer when value changes again before delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'b' })
    act(() => {
      jest.advanceTimersByTime(200)
    })
    // Still debouncing 'b' — change to 'c' before timer fires
    rerender({ value: 'c' })
    act(() => {
      jest.advanceTimersByTime(200)
    })
    // 400ms total but timer was reset at 200ms, so still not committed
    expect(result.current).toBe('a')

    act(() => {
      jest.advanceTimersByTime(100)
    })
    // 300ms since last change — now committed
    expect(result.current).toBe('c')
  })

  it('never commits intermediate values during rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'b' })
    rerender({ value: 'c' })
    rerender({ value: 'd' })
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(result.current).toBe('d')
  })

  describe('leading option', () => {
    const alwaysLeading = () => true
    const neverLeading = () => false
    const leadingWhenNext = (_prev: string, next: string) => next === 'none'

    it('commits immediately when leading returns true', () => {
      const { result, rerender } = renderHook(
        ({ value }) =>
          useDebouncedValue(value, 300, { leading: alwaysLeading }),
        { initialProps: { value: 'a' } }
      )

      rerender({ value: 'b' })
      // No timer advance needed — leading committed synchronously
      expect(result.current).toBe('b')
    })

    it('does not commit immediately when leading returns false', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 300, { leading: neverLeading }),
        { initialProps: { value: 'a' } }
      )

      rerender({ value: 'b' })
      expect(result.current).toBe('a')

      act(() => {
        jest.advanceTimersByTime(300)
      })
      expect(result.current).toBe('b')
    })

    it('commits immediately only for the matching transition, debounces others', () => {
      const { result, rerender } = renderHook(
        ({ value }) =>
          useDebouncedValue(value, 300, { leading: leadingWhenNext }),
        { initialProps: { value: 'compiling' } }
      )

      // active → active: debounced
      rerender({ value: 'rendering' })
      expect(result.current).toBe('compiling')

      act(() => {
        jest.advanceTimersByTime(300)
      })
      expect(result.current).toBe('rendering')

      // active → none: immediate
      rerender({ value: 'none' })
      expect(result.current).toBe('none')
    })

    it('active→active transitions during burst resolve to final value', () => {
      const { result, rerender } = renderHook(
        ({ value }) =>
          useDebouncedValue(value, 300, { leading: leadingWhenNext }),
        { initialProps: { value: 'compiling' } }
      )

      // Rapid burst: compiling→rendering→compiling→rendering
      rerender({ value: 'rendering' })
      rerender({ value: 'compiling' })
      rerender({ value: 'rendering' })

      // Still on original value, timer hasn't fired
      expect(result.current).toBe('compiling')

      act(() => {
        jest.advanceTimersByTime(300)
      })
      expect(result.current).toBe('rendering')
    })
  })
})
