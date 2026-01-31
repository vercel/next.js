import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  LogStream,
  FileSink,
  TuiSink,
  methodToLevel,
  getLogStream,
  initLogStream,
  type LogEvent,
} from '../log-stream'

const makeEvent = (overrides: Partial<LogEvent> = {}): LogEvent => ({
  ts: Date.now(),
  level: 'info',
  source: 'system',
  message: 'test',
  ...overrides,
})

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

describe('FileSink', () => {
  let tempDir: string
  let logPath: string

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-file-logger-test-'))
    logPath = path.join(tempDir, 'logs', 'next-development.log')
  })

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should create log file on first write', () => {
    new FileSink(logPath)

    // Check that a log file was created in the logs directory
    const logsDir = path.join(tempDir, 'logs')
    expect(fs.existsSync(logsDir)).toBe(true)

    const logFiles = fs.readdirSync(logsDir)
    expect(logFiles.length).toBe(1)
    expect(logFiles[0]).toBe('next-development.log')
  })

  it('should format log entries correctly', () => {
    const sink = new FileSink(logPath, 0)
    sink.write(
      makeEvent({
        source: 'browser',
        message: 'Test message',
        structured: { method: 'LOG' },
      })
    )
    sink.write(
      makeEvent({
        level: 'error',
        source: 'userland',
        message: 'Server error',
        structured: { method: 'ERROR' },
      })
    )
    sink.close()

    const logContent = fs.readFileSync(logPath, 'utf-8')
    const lines = logContent.trim().split('\n')

    expect(lines).toHaveLength(2)

    // Check format: JSON objects with timestamp, source, level, message
    const log1 = JSON.parse(lines[0])
    expect(log1).toMatchObject({
      timestamp: expect.stringMatching(/^\d{2}:\d{2}:\d{2}\.\d{3}$/),
      source: 'Browser',
      level: 'LOG',
      message: 'Test message',
    })

    const log2 = JSON.parse(lines[1])
    expect(log2).toMatchObject({
      timestamp: expect.stringMatching(/^\d{2}:\d{2}:\d{2}\.\d{3}$/),
      source: 'Server',
      level: 'ERROR',
      message: 'Server error',
    })
  })

  it('should append multiple log entries', () => {
    const sink = new FileSink(logPath, 0)
    sink.write(makeEvent({ source: 'browser', message: 'First message' }))
    sink.write(
      makeEvent({
        level: 'warn',
        source: 'browser',
        message: 'Second message',
      })
    )
    sink.write(makeEvent({ source: 'userland', message: 'Third message' }))
    sink.close()

    const logContent = fs.readFileSync(logPath, 'utf-8')
    const lines = logContent.trim().split('\n')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('First message')
    expect(lines[1]).toContain('Second message')
    expect(lines[2]).toContain('Third message')
  })

  it('should format different log levels correctly', () => {
    const sink = new FileSink(logPath, 0)
    sink.write(
      makeEvent({
        source: 'browser',
        message: 'Short level',
        structured: { method: 'LOG' },
      })
    )
    sink.write(
      makeEvent({
        level: 'warn',
        source: 'browser',
        message: 'Medium level',
        structured: { method: 'WARN' },
      })
    )
    sink.write(
      makeEvent({
        level: 'error',
        source: 'browser',
        message: 'Long level',
        structured: { method: 'ERROR' },
      })
    )
    sink.close()

    const logContent = fs.readFileSync(logPath, 'utf-8')
    const lines = logContent.trim().split('\n')

    expect(lines[0]).toContain('LOG')
    expect(lines[0]).toContain('Short level')
    expect(lines[1]).toContain('WARN')
    expect(lines[1]).toContain('Medium level')
    expect(lines[2]).toContain('ERROR')
    expect(lines[2]).toContain('Long level')
  })

  it('should skip request-scope events', () => {
    const sink = new FileSink(logPath, 0)
    sink.write(
      makeEvent({
        scope: 'request',
        message: 'GET /test 200 in 42ms',
        structured: {
          type: 'request',
          method: 'GET',
          url: '/test',
          status: 200,
        },
      })
    )
    sink.write(
      makeEvent({
        scope: 'console',
        source: 'browser',
        message: 'Hello',
        structured: { method: 'log' },
      })
    )
    sink.close()

    const logContent = fs.readFileSync(logPath, 'utf-8')
    const lines = logContent.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Hello')
    expect(logContent).not.toContain('GET /test')
  })

  describe('batching behavior', () => {
    it('should batch multiple logs and flush them together', () => {
      const sink = new FileSink(logPath, 10000) // Long delay — won't auto-flush
      sink.write(
        makeEvent({ source: 'browser', message: 'First batched message' })
      )
      sink.write(
        makeEvent({
          level: 'warn',
          source: 'browser',
          message: 'Second batched message',
        })
      )
      sink.write(
        makeEvent({ source: 'userland', message: 'Third batched message' })
      )

      // Initially, the log file should be empty
      const initialContent = fs.readFileSync(logPath, 'utf-8')
      expect(initialContent.trim()).toBe('')

      // Force flush to write all batched logs
      sink.close()

      const logContent = fs.readFileSync(logPath, 'utf-8')
      const lines = logContent.trim().split('\n')

      expect(lines).toHaveLength(3)
      expect(lines[0]).toContain('First batched message')
      expect(lines[1]).toContain('Second batched message')
      expect(lines[2]).toContain('Third batched message')
    })

    it('should flush automatically after flush interval', async () => {
      const sink = new FileSink(logPath, 10) // 10ms flush delay
      sink.write(
        makeEvent({ source: 'browser', message: 'Auto-flush test message' })
      )

      // Initially, the log file should be empty
      const initialContent = fs.readFileSync(logPath, 'utf-8')
      expect(initialContent.trim()).toBe('')

      // Wait for the flush interval plus a small buffer
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Now the log should be written
      const logContent = fs.readFileSync(logPath, 'utf-8')
      const lines = logContent.trim().split('\n')

      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('Auto-flush test message')

      sink.close()
    })

    it('should flush immediately on close', () => {
      const sink = new FileSink(logPath, 10000) // Long delay
      sink.write(makeEvent({ level: 'error', message: 'Error message' }))
      sink.close()

      const content = fs.readFileSync(logPath, 'utf-8')
      expect(content).toContain('ERROR')
      expect(content).toContain('Error message')
    })
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
      expect(stream.since(1500, 1).map((l) => l.message)).toEqual(['new2'])
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

describe('TuiSink', () => {
  let originalSend: typeof process.send
  let sentMessages: any[]

  beforeEach(() => {
    sentMessages = []
    originalSend = process.send as typeof process.send
    ;(process as any).send = (msg: any) => {
      sentMessages.push(msg)
      return true
    }
  })

  afterEach(() => {
    ;(process as any).send = originalSend
  })

  it('sends console logs from userland to TUI via IPC', () => {
    const sink = new TuiSink()

    sink.write({
      ts: Date.now(),
      level: 'info',
      source: 'userland',
      scope: 'console',
      message: 'Test console message',
    })

    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0].tuiMessage).toEqual({
      type: 'structured-log',
      payload: {
        type: 'console',
        level: 'info',
        method: 'info',
        message: 'Test console message',
        source: 'userland',
      },
    })
  })

  it('sends console logs from browser to TUI via IPC', () => {
    const sink = new TuiSink()

    sink.write({
      ts: Date.now(),
      level: 'error',
      source: 'browser',
      scope: 'console',
      message: 'Browser error',
    })

    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0].tuiMessage.payload).toMatchObject({
      type: 'console',
      source: 'browser',
      level: 'error',
    })
  })

  it('ignores request scope logs without structured data', () => {
    const sink = new TuiSink()

    sink.write({
      ts: Date.now(),
      level: 'info',
      source: 'userland',
      scope: 'request',
      message: 'Request log',
    })

    expect(sentMessages).toHaveLength(0)
  })

  it('forwards request scope logs with structured data', () => {
    const sink = new TuiSink()

    const structured = {
      type: 'request',
      method: 'GET',
      url: '/test',
      status: 200,
      totalTime: 42,
    }
    sink.write({
      ts: Date.now(),
      level: 'info',
      source: 'userland',
      scope: 'request',
      message: 'GET /test 200 in 42ms',
      structured,
    })

    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0].tuiMessage).toEqual({
      type: 'structured-log',
      payload: structured,
    })
  })

  it('ignores system source logs', () => {
    const sink = new TuiSink()

    sink.write({
      ts: Date.now(),
      level: 'info',
      source: 'system',
      scope: 'console',
      message: 'System log',
    })

    expect(sentMessages).toHaveLength(0)
  })

  it('forwards structured console data (location, stack) when available', () => {
    const sink = new TuiSink()

    sink.write({
      ts: Date.now(),
      level: 'error',
      source: 'browser',
      scope: 'console',
      message: 'Component error',
      structured: {
        method: 'error',
        location: 'src/app/page.tsx:10:5',
        rawStack: 'Error: Component error\n    at Page (src/app/page.tsx:10:5)',
      },
    })

    expect(sentMessages).toHaveLength(1)
    const payload = sentMessages[0].tuiMessage.payload
    expect(payload).toMatchObject({
      type: 'console',
      level: 'error',
      method: 'error',
      message: 'Component error',
      source: 'browser',
      location: 'src/app/page.tsx:10:5',
      rawStack: expect.stringContaining('Component error'),
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
