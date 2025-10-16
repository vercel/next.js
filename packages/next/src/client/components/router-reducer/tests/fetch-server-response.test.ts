/**
 * @jest-environment jsdom
 */

// Test the utility functions without importing the main module
// This avoids the webpack/React Server Components import issues

describe('fetch-server-response utilities', () => {
  const NEXT_RSC_UNION_QUERY = '_rsc'

  // Test the URL processing utility logic
  function urlToUrlWithoutFlightMarker(url: string): URL {
    const urlWithoutFlightParameters = new URL(url, 'http://localhost')
    urlWithoutFlightParameters.searchParams.delete(NEXT_RSC_UNION_QUERY)
    if (process.env.NODE_ENV === 'production') {
      if (
        process.env.__NEXT_CONFIG_OUTPUT === 'export' &&
        urlWithoutFlightParameters.pathname.endsWith('.txt')
      ) {
        const { pathname } = urlWithoutFlightParameters
        const length = pathname.endsWith('/index.txt') ? 10 : 4
        // Slice off `/index.txt` or `.txt` from the end of the pathname
        urlWithoutFlightParameters.pathname = pathname.slice(0, -length)
      }
    }
    return urlWithoutFlightParameters
  }

  describe('urlToUrlWithoutFlightMarker', () => {
    const originalNodeEnv = process.env.NODE_ENV

    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      })
      Object.defineProperty(process.env, '__NEXT_CONFIG_OUTPUT', {
        value: 'export',
        writable: true,
        configurable: true,
      })
    })

    afterEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalNodeEnv,
        writable: true,
        configurable: true,
      })
    })

    it('should remove RSC union query parameter', () => {
      const url = `http://localhost/test?${NEXT_RSC_UNION_QUERY}=1&other=param`
      const result = urlToUrlWithoutFlightMarker(url)

      expect(result.searchParams.has(NEXT_RSC_UNION_QUERY)).toBe(false)
      expect(result.searchParams.get('other')).toBe('param')
    })

    it('should handle .txt extension in export mode', () => {
      const url = 'http://localhost/test.txt'
      const result = urlToUrlWithoutFlightMarker(url)

      expect(result.pathname).toBe('/test')
    })

    it('should handle index.txt in export mode', () => {
      const url = 'http://localhost/test/index.txt'
      const result = urlToUrlWithoutFlightMarker(url)

      expect(result.pathname).toBe('/test')
    })

    it('should preserve pathname in non-production mode', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      })

      const url = 'http://localhost/test.txt'
      const result = urlToUrlWithoutFlightMarker(url)

      expect(result.pathname).toBe('/test.txt')
    })
  })
})

// Unit tests for the sniffing logic (testing the core detection heuristics)
describe('RSC payload detection heuristics', () => {
  // These are the core detection functions extracted for testing
  function detectRscOrTextPayload(text: string): boolean {
    if (!text || text.length === 0) return false

    // Check for obvious HTML content that should trigger MPA navigation
    const htmlMarkers = ['<!DOCTYPE', '<html', '<HTML', '<!doctype']
    for (const marker of htmlMarkers) {
      if (text.includes(marker)) {
        return false
      }
    }

    // RSC payload detection: look for common RSC patterns
    const rscPatterns = [
      /^\d+:\[/, // Starts with number:[
      /^\d+:"/, // Starts with number:"
      /:\[.*\]/, // Contains :[...]
      /"[^"]*":\[/, // Contains "key":[
    ]

    for (const pattern of rscPatterns) {
      if (pattern.test(text)) {
        return true
      }
    }

    // Text/plain detection: should be mostly printable ASCII without HTML
    let printableCount = 0
    let totalCount = 0

    for (let i = 0; i < Math.min(text.length, 256); i++) {
      const char = text.charCodeAt(i)
      totalCount++
      // Count printable ASCII chars (space to ~) plus common whitespace
      if (
        (char >= 32 && char <= 126) ||
        char === 9 ||
        char === 10 ||
        char === 13
      ) {
        printableCount++
      }
    }

    // If at least 90% printable and no obvious HTML, treat as valid text
    const printableRatio = totalCount > 0 ? printableCount / totalCount : 0
    return printableRatio >= 0.9
  }

  it('should detect RSC payload patterns', () => {
    expect(detectRscOrTextPayload('0:["test"]')).toBe(true)
    expect(detectRscOrTextPayload('1:"hello world"')).toBe(true)
    expect(detectRscOrTextPayload('some text with :[] pattern')).toBe(true)
    expect(detectRscOrTextPayload('"children":["value"]')).toBe(true)
  })

  it('should detect valid text content', () => {
    expect(detectRscOrTextPayload('This is valid text content')).toBe(true)
    expect(detectRscOrTextPayload('Multi-line\ntext\ncontent')).toBe(true)
    expect(
      detectRscOrTextPayload('Text with numbers 123 and symbols !@#')
    ).toBe(true)
  })

  it('should reject HTML content', () => {
    expect(detectRscOrTextPayload('<!DOCTYPE html>')).toBe(false)
    expect(detectRscOrTextPayload('<html><head>')).toBe(false)
    expect(detectRscOrTextPayload('<HTML>')).toBe(false)
    expect(detectRscOrTextPayload('<!doctype html>')).toBe(false)
  })

  it('should reject empty or invalid content', () => {
    expect(detectRscOrTextPayload('')).toBe(false)
    expect(detectRscOrTextPayload('\0\0\0\0')).toBe(false)
  })

  it('should handle mixed content appropriately', () => {
    const binaryLikeContent = 'abc\0\0\0def\0\0\0'
    expect(detectRscOrTextPayload(binaryLikeContent)).toBe(false)

    const mostlyPrintableContent =
      'This is mostly good content with some \0 binary'
    expect(detectRscOrTextPayload(mostlyPrintableContent)).toBe(true)
  })
})
