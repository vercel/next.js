import {
  formatStackFrameFile,
  isWebpackInternalResource,
} from './webpack-module-path'

describe('webpack-module-path', () => {
  describe('isWebpackInternalResource', () => {
    it('should return true for webpack-internal paths', () => {
      expect(
        isWebpackInternalResource('webpack-internal:///./src/hello.tsx')
      ).toBe(true)

      expect(isWebpackInternalResource('webpack://_N_E/./src/hello.tsx')).toBe(
        true
      )
      expect(isWebpackInternalResource('webpack://./src/hello.tsx')).toBe(true)
      expect(isWebpackInternalResource('webpack:///./src/hello.tsx')).toBe(true)
    })

    it('should return false for non-webpack-internal paths', () => {
      expect(isWebpackInternalResource('<anonymous>')).toBe(false)
      expect(isWebpackInternalResource('file:///src/hello.tsx')).toBe(false)
    })
  })

  describe('formatFrameSourceFile', () => {
    it('should return the original file path', () => {
      expect(formatStackFrameFile('webpack-internal:///./src/hello.tsx')).toBe(
        './src/hello.tsx'
      )
      expect(formatStackFrameFile('webpack://_N_E/./src/hello.tsx')).toBe(
        './src/hello.tsx'
      )
      expect(formatStackFrameFile('webpack://./src/hello.tsx')).toBe(
        './src/hello.tsx'
      )
      expect(formatStackFrameFile('webpack:///./src/hello.tsx')).toBe(
        './src/hello.tsx'
      )
    })
  })
})
