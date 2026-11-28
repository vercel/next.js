/* eslint-env jest */
import { createFormSubmitDestinationUrl } from 'next/src/client/form-shared'

describe('createFormSubmitDestinationUrl', () => {
  let originalWindow: typeof window

  beforeAll(() => {
    originalWindow = (global as any).window
    ;(global as any).window = {
      location: {
        href: 'http://localhost:3000/test-page',
      },
    }
  })

  afterAll(() => {
    ;(global as any).window = originalWindow
  })

  it('normalizes single LF and CR line endings in form field names and values to CRLF', () => {
    const entries = [
      ['single_line', 'hello world'],
      ['multi_line', 'line1\nline2\rline3\r\nline4'],
      ['field\nname', 'val\nval'],
    ]

    const mockFormElement = {
      [Symbol.iterator]: function* () {
        yield* entries
      },
    } as unknown as HTMLFormElement

    // Mock global FormData to return our entries when called with mockFormElement
    const originalFormData = (global as any).FormData
    ;(global as any).FormData = class MockFormData {
      private data: [string, any][]
      constructor(_form: any) {
        this.data = entries as [string, any][]
      }
      *[Symbol.iterator]() {
        yield* this.data
      }
    }

    try {
      const targetUrl = createFormSubmitDestinationUrl('/search', mockFormElement)
      expect(targetUrl.pathname).toBe('/search')
      expect(targetUrl.searchParams.get('single_line')).toBe('hello world')
      expect(targetUrl.searchParams.get('multi_line')).toBe('line1\r\nline2\r\nline3\r\nline4')
      expect(targetUrl.searchParams.get('field\r\nname')).toBe('val\r\nval')
    } finally {
      ;(global as any).FormData = originalFormData
    }
  })
})
