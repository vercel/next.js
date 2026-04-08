import {
  categorizeRequest,
  parseStack,
  parseErrorWithLocation,
  stripConsoleFormatting,
  isStartupNoise,
  matchesFilter,
  formatLogForCopy,
} from '../utils'
import type { TuiLogEntry } from '../types'

const makeLog = (overrides: Partial<TuiLogEntry> = {}): TuiLogEntry => ({
  id: 1,
  timestamp: Date.now(),
  level: 'info',
  message: 'test',
  source: 'system',
  ...overrides,
})

describe('categorizeRequest', () => {
  it('categorizes different request types', () => {
    expect(categorizeRequest('/').category).toBe('page')
    expect(categorizeRequest('/about?foo=bar').routeName).toBe('/about')
    expect(categorizeRequest('/api/users').category).toBe('api')
    expect(categorizeRequest('/_next/webpack-hmr').category).toBe('hmr')
    expect(categorizeRequest('/page.rsc').category).toBe('rsc')
    expect(categorizeRequest('/dashboard?_rsc=abc').category).toBe('rsc')
    expect(categorizeRequest('/page_rscdata').category).toBe('page') // substring should not match
    expect(categorizeRequest('/_next/static/chunks/main.js').category).toBe(
      'static'
    )
    expect(categorizeRequest('/logo.png').category).toBe('static')
  })
})

describe('parseStack', () => {
  it('extracts user frames and filters out internals', () => {
    const stack = `Error: test
    at myFunction (src/app/page.tsx:10:5)
    at Object.<anonymous> (node_modules/react/index.js:1:1)
    at render (src/components/Layout.tsx:20:10)`

    const result = parseStack(stack)
    expect(result.location).toBe('src/app/page.tsx:10:5')
    expect(result.stackLines).toHaveLength(2)
  })
})

describe('parseErrorWithLocation', () => {
  it('parses error marker with file location', () => {
    const result = parseErrorWithLocation(
      '⨯ src/app/page.tsx (10:5) Something went wrong'
    )
    expect(result).toEqual({
      file: 'src/app/page.tsx',
      line: 10,
      col: 5,
      message: 'Something went wrong',
    })
    expect(parseErrorWithLocation('Just a normal message')).toBeNull()
  })
})

describe('stripConsoleFormatting', () => {
  it('only strips CSS formatting when %c is present', () => {
    // Non-%c messages should pass through unchanged
    expect(stripConsoleFormatting('Config loaded color:red')).toBe(
      'Config loaded color:red'
    )

    // %c messages should have formatting stripped
    const result = stripConsoleFormatting(
      '%cHello%c world color:red;font-weight:bold'
    )
    expect(result).not.toContain('%c')
    expect(result).toContain('Hello')
  })
})

describe('isStartupNoise', () => {
  it('detects Next.js startup banner lines', () => {
    expect(isStartupNoise('  ▲ Next.js 15.0.0')).toBe(true)
    expect(isStartupNoise('  - Local: http://localhost:3000')).toBe(true)
    expect(isStartupNoise('  ✓ Ready in 1.2s')).toBe(true)
    expect(isStartupNoise('GET / 200 in 50ms')).toBe(false)
  })
})

describe('matchesFilter', () => {
  it('filters logs by type', () => {
    const error = makeLog({ level: 'error' })
    const warn = makeLog({ level: 'warn' })
    const info = makeLog({ level: 'info' })
    const browser = makeLog({ source: 'browser' })
    const request = makeLog({
      structured: {
        type: 'request',
        method: 'GET',
        url: '/',
        status: 200,
        totalTime: 10,
      },
    })

    expect(matchesFilter(info, 'all')).toBe(true)
    expect(matchesFilter(error, 'errors')).toBe(true)
    expect(matchesFilter(info, 'errors')).toBe(false)
    expect(matchesFilter(warn, 'warnings')).toBe(true)
    expect(matchesFilter(error, 'warnings')).toBe(true)
    expect(matchesFilter(info, 'warnings')).toBe(false)
    expect(matchesFilter(browser, 'browser')).toBe(true)
    expect(matchesFilter(info, 'browser')).toBe(false)
    expect(matchesFilter(request, 'requests')).toBe(true)
    expect(matchesFilter(info, 'requests')).toBe(false)
  })
})

describe('formatLogForCopy', () => {
  it('formats request logs with fetch metrics', () => {
    const log = makeLog({
      structured: {
        type: 'request',
        method: 'GET',
        url: '/page',
        status: 200,
        totalTime: 50,
        fetchMetrics: [
          {
            method: 'GET',
            url: 'https://api.example.com/data',
            status: 200,
            totalTime: 30,
            cacheStatus: 'miss',
          },
        ],
      },
    })
    const result = formatLogForCopy(log)
    expect(result).toContain('GET /page 200 50ms')
    expect(result).toContain('Fetches: 1')
    expect(result).toContain('api.example.com')
  })

  it('formats console logs with location', () => {
    const log = makeLog({
      structured: {
        type: 'console',
        method: 'log' as const,
        source: 'browser' as const,
        message: 'Hello world',
        location: 'src/app/page.tsx:10:5',
      },
    })
    const result = formatLogForCopy(log)
    expect(result).toContain('[browser]')
    expect(result).toContain('Hello world')
    expect(result).toContain('src/app/page.tsx:10:5')
  })

  it('formats plain text logs', () => {
    const log = makeLog({ message: 'plain message' })
    const result = formatLogForCopy(log)
    expect(result).toContain('plain message')
  })
})
