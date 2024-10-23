import { formatFrameSourceFile, isWebpackBundled } from './webpack-module-path'

describe('webpack-module-path', () => {
  describe('isWebpackBundled', () => {
    it('should return true for webpack-internal paths', () => {
      expect(isWebpackBundled('webpack-internal:///./src/hello.tsx')).toBe(true)
      expect(
        isWebpackBundled(
          'rsc://React/Server/webpack-internal:///(rsc)/./src/hello.tsx?42'
        )
      ).toBe(true)
      expect(
        isWebpackBundled(
          'rsc://React/Server/webpack:///(rsc)/./src/hello.tsx?42'
        )
      ).toBe(true)
      expect(
        isWebpackBundled(
          'rsc://React/Server/webpack:///(app-pages-browser)/./src/hello.tsx?42'
        )
      ).toBe(true)
      expect(isWebpackBundled('webpack://_N_E/./src/hello.tsx')).toBe(true)
      expect(isWebpackBundled('webpack://./src/hello.tsx')).toBe(true)
      expect(isWebpackBundled('webpack:///./src/hello.tsx')).toBe(true)
    })

    it('should return false for non-webpack-internal paths', () => {
      expect(isWebpackBundled('<anonymous>')).toBe(false)
      expect(isWebpackBundled('file:///src/hello.tsx')).toBe(false)
    })
  })

  describe('formatFrameSourceFile', () => {
    it('should return the original file path', () => {
      expect(formatFrameSourceFile('webpack-internal:///./src/hello.tsx')).toBe(
        './src/hello.tsx'
      )
      expect(
        formatFrameSourceFile(
          'rsc://React/Server/webpack-internal:///(rsc)/./src/hello.tsx?42'
        )
      ).toBe('./src/hello.tsx')
      expect(
        formatFrameSourceFile(
          'rsc://React/Server/webpack:///(rsc)/./src/hello.tsx?42'
        )
      ).toBe('./src/hello.tsx')
      expect(
        formatFrameSourceFile(
          'rsc://React/Server/webpack:///(app-pages-browser)/./src/hello.tsx?42'
        )
      ).toBe('./src/hello.tsx')
      expect(formatFrameSourceFile('webpack://_N_E/./src/hello.tsx')).toBe(
        './src/hello.tsx'
      )
      expect(formatFrameSourceFile('webpack://./src/hello.tsx')).toBe(
        './src/hello.tsx'
      )
      expect(formatFrameSourceFile('webpack:///./src/hello.tsx')).toBe(
        './src/hello.tsx'
      )
    })

    it('should return an empty string for <anonymous> file paths', () => {
      expect(formatFrameSourceFile('<anonymous>')).toBe('')
    })
  })
})
