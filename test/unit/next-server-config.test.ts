/* eslint-env jest */
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import config, {
  isTargetLikeServerless,
  normalizeConfig,
  setHttpAgentOptions,
} from 'next/dist/server/config'
import { getDefaultConfig } from 'next/dist/server/config-shared'

describe('next/server/config', () => {
  describe('config', () => {
    it('should be a function', () => {
      expect(config).toEqual(expect.any(Function))
    })

    // Additional config tests found at `test/unit/isolated/config.test.ts`.
  })

  describe('isTargetLikeServerless', () => {
    it('should be a function', () => {
      expect(isTargetLikeServerless).toEqual(expect.any(Function))
    })

    it('should should be false for unknown target', () => {
      expect(isTargetLikeServerless('unkown-mock-targer')).toBeFalsy()
    })

    it('should should be true for `serverless` target', () => {
      expect(isTargetLikeServerless('serverless')).toBeTruthy()
    })

    it('should should be true for `experimental-serverless-trace` target', () => {
      expect(
        isTargetLikeServerless('experimental-serverless-trace')
      ).toBeTruthy()
    })
  })

  describe('normalizeConfig', () => {
    it('should be a function', () => {
      expect(normalizeConfig).toEqual(expect.any(Function))
    })

    it('should return config when not a function', () => {
      const config = 'mock-non-function-config'

      expect(normalizeConfig('mock-phase', config)).toBe(config)
    })

    it('should call config with phase and defaultConfig', () => {
      const config = jest.fn().mockReturnValue('mock-return-value')

      const result = normalizeConfig('mock-phase', config)

      expect(result).toBe('mock-return-value')
      expect(config).toHaveBeenCalledTimes(1)

      const [phase, options] = config.mock.calls[0]

      expect(phase).toBe('mock-phase')
      expect(options).toStrictEqual({ defaultConfig: getDefaultConfig() })
    })

    it('should throw an error if config returns a promise', () => {
      const config = jest.fn().mockResolvedValue('mock-resolve-value')

      expect(() => normalizeConfig('mock-phase', config)).toThrowError(
        '> Promise returned in next config. https://nextjs.org/docs/messages/promise-in-next-confi'
      )
    })
  })

  describe('setHttpAgentOptions', () => {
    beforeEach(() => {
      delete (global as any).__NEXT_HTTP_AGENT
      delete (global as any).__NEXT_HTTPS_AGENT
    })

    it('should be a function', () => {
      expect(setHttpAgentOptions).toEqual(expect.any(Function))
    })

    it('should throw an error with no options', () => {
      // @ts-ignore
      expect(() => setHttpAgentOptions()).toThrowError(
        'Expected config.httpAgentOptions to be an object'
      )
    })

    it('should set __NEXT_HTTP_AGENT and __NEXT_HTTPS_AGENT', () => {
      setHttpAgentOptions({
        keepAlive: false,
      })

      expect((global as any).__NEXT_HTTP_AGENT).toEqual(expect.any(HttpAgent))
      expect((global as any).__NEXT_HTTPS_AGENT).toEqual(expect.any(HttpsAgent))
    })

    it('should only set __NEXT_HTTP_AGENT and __NEXT_HTTPS_AGENT once', () => {
      setHttpAgentOptions({
        keepAlive: false,
      })

      const httpAgent = (global as any).__NEXT_HTTP_AGENT
      const httpsAgent = (global as any).__NEXT_HTTPS_AGENT

      expect((global as any).__NEXT_HTTP_AGENT).toEqual(expect.any(HttpAgent))
      expect((global as any).__NEXT_HTTPS_AGENT).toEqual(expect.any(HttpsAgent))

      setHttpAgentOptions({
        keepAlive: false,
      })

      expect((global as any).__NEXT_HTTP_AGENT).toBe(httpAgent)
      expect((global as any).__NEXT_HTTPS_AGENT).toBe(httpsAgent)
    })
  })
})
