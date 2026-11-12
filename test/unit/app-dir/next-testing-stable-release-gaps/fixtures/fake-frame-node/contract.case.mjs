import { test, expect, vi } from 'vitest'
test('frame globals installed before the lazy clock are faked', () => {
  vi.stubGlobal('requestAnimationFrame', (callback) =>
    setTimeout(() => callback(performance.now()), 16)
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  try {
    vi.useFakeTimers({
      now: 0,
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    })
    const seen = []
    requestAnimationFrame((time) => seen.push(time))
    vi.advanceTimersToNextFrame()
    expect(seen).toEqual([16])
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})
