import {
  LogStream,
  methodToLevel,
  getLogStream,
  initLogStream,
  type LogEvent,
} from '../log-stream'

describe('methodToLevel', () => {
  it('maps console methods to log levels', () => {
    expect(methodToLevel('error')).toBe('error')
    expect(methodToLevel('assert')).toBe('error')
    expect(methodToLevel('warn')).toBe('warn')
    expect(methodToLevel('debug')).toBe('debug')
    expect(methodToLevel('log')).toBe('info')
    expect(methodToLevel('info')).toBe('info')
    expect(methodToLevel('unknown')).toBe('info')
  })
})

describe('LogStream', () => {
  it('stores and retrieves logs with metadata', () => {
    const stream = new LogStream(10)
    stream.emit('info', 'test', {
      source: 'browser',
      scope: 'console',
      structured: { key: 'value' },
    })

    const [log] = stream.recent(1)
    expect(log.message).toBe('test')
    expect(log.level).toBe('info')
    expect(log.source).toBe('browser')
    expect(log.scope).toBe('console')
    expect(log.structured).toEqual({ key: 'value' })
    expect(log.ts).toBeGreaterThan(0)
  })

  it('defaults source to system', () => {
    const stream = new LogStream(10)
    stream.emit('info', 'msg')
    expect(stream.recent(1)[0].source).toBe('system')
  })

  it('returns logs in chronological order', () => {
    const stream = new LogStream(10)
    stream.emit('info', 'first')
    stream.emit('warn', 'second')
    stream.emit('error', 'third')

    const logs = stream.recent(10)
    expect(logs.map((l) => l.message)).toEqual(['first', 'second', 'third'])
  })

  it('respects the limit parameter in recent()', () => {
    const stream = new LogStream(10)
    stream.emit('info', 'one')
    stream.emit('info', 'two')
    stream.emit('info', 'three')

    const logs = stream.recent(2)
    expect(logs.map((l) => l.message)).toEqual(['two', 'three'])
  })

  describe('ring buffer', () => {
    it('overwrites oldest entries when capacity is exceeded', () => {
      const stream = new LogStream(3)
      stream.emit('info', 'a')
      stream.emit('info', 'b')
      stream.emit('info', 'c')
      stream.emit('info', 'd')
      stream.emit('info', 'e')

      const logs = stream.recent(10)
      expect(logs).toHaveLength(3)
      expect(logs.map((l) => l.message)).toEqual(['c', 'd', 'e'])
    })
  })

  describe('since', () => {
    it('filters logs by timestamp with optional limit', () => {
      const stream = new LogStream(10)
      const dateSpy = jest.spyOn(Date, 'now')

      dateSpy.mockReturnValue(1000)
      stream.emit('info', 'old')
      dateSpy.mockReturnValue(2000)
      stream.emit('info', 'new1')
      dateSpy.mockReturnValue(3000)
      stream.emit('info', 'new2')
      dateSpy.mockRestore()

      expect(stream.since(1500).map((l) => l.message)).toEqual(['new1', 'new2'])
    })
  })

  describe('stats', () => {
    it('returns count capped at capacity', () => {
      const stream = new LogStream(3)
      stream.emit('info', '1')
      stream.emit('info', '2')
      expect(stream.stats()).toEqual({ count: 2, capacity: 3 })

      stream.emit('info', '3')
      stream.emit('info', '4')
      stream.emit('info', '5')
      expect(stream.stats()).toEqual({ count: 3, capacity: 3 })
    })
  })

  describe('sinks', () => {
    it('forwards logs to sinks and handles errors gracefully', () => {
      const stream = new LogStream(10)
      const received: LogEvent[] = []

      stream.addSink({ write: (e) => received.push(e) })
      stream.addSink({
        write: () => {
          throw new Error('sink error')
        },
      })

      expect(() => stream.emit('info', 'test')).not.toThrow()
      expect(received).toHaveLength(1)
      expect(stream.recent(1)).toHaveLength(1)
    })

    it('calls close on sinks when stream closes', () => {
      const stream = new LogStream(10)
      let closed = false
      stream.addSink({ write: () => {}, close: () => (closed = true) })

      stream.close()
      expect(closed).toBe(true)
      expect(stream.stats().count).toBe(0)
    })
  })
})

describe('global instance', () => {
  it('getLogStream returns singleton, initLogStream creates fresh instance', () => {
    const a = getLogStream()
    const b = getLogStream()
    expect(a).toBe(b)

    a.emit('info', 'old log')
    const fresh = initLogStream(50)

    expect(fresh).not.toBe(a)
    expect(fresh.stats()).toEqual({ count: 0, capacity: 50 })
    expect(getLogStream()).toBe(fresh)
  })
})
