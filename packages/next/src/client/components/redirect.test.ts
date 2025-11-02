import {
  getURLFromRedirectError,
  redirect,
  permanentRedirect,
} from './redirect'
import { isRedirectError } from './redirect-error'

describe('redirect', () => {
  const originalEnv = process.env.__NEXT_ROUTER_BASEPATH

  afterEach(() => {
    // Restore original basePath after each test
    if (originalEnv === undefined) {
      delete process.env.__NEXT_ROUTER_BASEPATH
    } else {
      process.env.__NEXT_ROUTER_BASEPATH = originalEnv
    }
  })

  it('should throw a redirect error', () => {
    try {
      redirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/dashboard')
    }
  })

  it('should prepend basePath to relative URLs', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/experiments'

    try {
      redirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/experiments/dashboard')
    }
  })

  it('should not prepend basePath to absolute URLs with http://', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/experiments'

    try {
      redirect('http://example.com/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual(
        'http://example.com/dashboard'
      )
    }
  })

  it('should not prepend basePath to absolute URLs with https://', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/experiments'

    try {
      redirect('https://example.com/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual(
        'https://example.com/dashboard'
      )
    }
  })

  it('should not duplicate basePath if URL already starts with it', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/experiments'

    try {
      redirect('/experiments/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/experiments/dashboard')
    }
  })

  it('should handle basePath with trailing slash', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/experiments/'

    try {
      redirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/experiments/dashboard')
    }
  })

  it('should handle URLs without leading slash', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/experiments'

    try {
      redirect('dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/experiments/dashboard')
    }
  })

  it('should work without basePath configured', () => {
    delete process.env.__NEXT_ROUTER_BASEPATH

    try {
      redirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/dashboard')
    }
  })

  it('should prepend basePath for permanentRedirect', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/experiments'

    try {
      permanentRedirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/experiments/dashboard')
    }
  })

  it('should not prepend basePath to external URLs in permanentRedirect', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/experiments'

    try {
      permanentRedirect('https://example.com')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('https://example.com')
    }
  })

  it('should handle empty basePath', () => {
    process.env.__NEXT_ROUTER_BASEPATH = ''

    try {
      redirect('/dashboard')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/dashboard')
    }
  })

  it('should not incorrectly match partial path prefixes', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/app'

    try {
      redirect('/apple')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/app/apple')
    }
  })

  it('should not incorrectly match another partial path prefix', () => {
    process.env.__NEXT_ROUTER_BASEPATH = '/docs'

    try {
      redirect('/docs-new')
      throw new Error('did not throw')
    } catch (err: any) {
      expect(isRedirectError(err)).toBeTruthy()
      expect(getURLFromRedirectError(err)).toEqual('/docs/docs-new')
    }
  })
})
