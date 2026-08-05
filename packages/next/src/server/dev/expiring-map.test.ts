import { setWithExpiry } from './expiring-map'

describe('setWithExpiry', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('keeps the entry until the ttl elapses', () => {
    const map = new Map<string, string>()
    setWithExpiry(map, 'a', 'value', 1_000)
    expect(map.get('a')).toBe('value')
    jest.advanceTimersByTime(999)
    expect(map.get('a')).toBe('value')
  })

  it('deletes the entry after the ttl', () => {
    const map = new Map<string, string>()
    setWithExpiry(map, 'a', 'value', 1_000)
    jest.advanceTimersByTime(1_000)
    expect(map.has('a')).toBe(false)
  })

  it('does not delete a replaced value when the stale timer fires', () => {
    const map = new Map<string, string>()
    setWithExpiry(map, 'a', 'old', 1_000)
    jest.advanceTimersByTime(500)
    setWithExpiry(map, 'a', 'new', 1_000)
    // The first timer fires here and must not remove 'new'.
    jest.advanceTimersByTime(500)
    expect(map.get('a')).toBe('new')
    jest.advanceTimersByTime(500)
    expect(map.has('a')).toBe(false)
  })

  it('leaves a consumed entry deleted when its timer fires', () => {
    const map = new Map<string, string>()
    setWithExpiry(map, 'a', 'value', 500)
    map.delete('a')
    jest.advanceTimersByTime(1_000)
    expect(map.has('a')).toBe(false)
  })

  it('guards by reference identity for object values', () => {
    const map = new Map<string, { v: number }>()
    const oldValue = { v: 1 }
    const newValue = { v: 2 }
    setWithExpiry(map, 'a', oldValue, 1_000)
    map.set('a', newValue)
    jest.advanceTimersByTime(2_000)
    expect(map.get('a')).toBe(newValue)
  })

  it('does not keep the process alive (timer is unrefed)', () => {
    const map = new Map<string, string>()
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
    setWithExpiry(map, 'a', 'value', 1_000)
    const timer = setTimeoutSpy.mock.results[0].value as NodeJS.Timeout
    expect(typeof timer.unref).toBe('function')
    setTimeoutSpy.mockRestore()
  })
})
