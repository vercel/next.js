import { getModuleContext } from './context'
import { validateURL } from '../utils'

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  validateURL: jest.fn(jest.requireActual('../utils').validateURL),
}))

const mockedValidateURL = jest.mocked(validateURL)

describe('Next.js sandbox Request constructor', () => {
  let moduleContext: any

  beforeEach(async () => {
    mockedValidateURL.mockClear()
    moduleContext = await getModuleContext({
      moduleName: 'test-module',
      onError: () => {},
      onWarning: () => {},
      useCache: false,
      distDir: '/tmp',
      edgeFunctionEntry: {
        assets: [],
        wasm: [],
        env: {},
      },
    })
  })

  it('should preserve Request method when copying Request in Next.js context', () => {
    const { Request: NextRequest } = moduleContext.runtime.context

    const originalRequest = new NextRequest('https://example.com', {
      method: 'POST',
    })
    expect(originalRequest.method).toBe('POST')

    const copiedRequest = new NextRequest(originalRequest)

    expect(copiedRequest.method).toBe('POST')
    expect(copiedRequest.url).toBe('https://example.com/')
  })

  it('should validate URL is called during Request construction', () => {
    const { Request: NextRequest } = moduleContext.runtime.context

    new NextRequest('https://example.com')
    expect(mockedValidateURL).toHaveBeenCalledWith('https://example.com')
  })

  it('should handle Request with body and headers correctly', () => {
    const { Request: NextRequest } = moduleContext.runtime.context

    const originalRequest = new NextRequest('https://example.com', {
      method: 'POST',
      body: 'test body',
      headers: { 'Content-Type': 'application/json' },
    })

    const copiedRequest = new NextRequest(originalRequest)

    expect(copiedRequest.method).toBe('POST')
    expect(copiedRequest.headers.get('Content-Type')).toBe('application/json')
  })

  it('should throw Next.js specific error for relative URLs', () => {
    const { Request: NextRequest } = moduleContext.runtime.context
    expect(() => new NextRequest('/urls-b')).toThrow(
      'Please use only absolute URLs'
    )
  })
})
