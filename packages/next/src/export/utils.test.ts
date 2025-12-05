import { hasCustomExportOutput } from './utils'
import type { NextConfigComplete } from '../server/config-shared'

describe('export/utils', () => {
  describe('hasCustomExportOutput', () => {
    it('should return true when output is export and distDir is not .next', () => {
      const config = {
        output: 'export',
        distDir: 'custom-dist',
      } as NextConfigComplete

      expect(hasCustomExportOutput(config)).toBe(true)
    })

    it('should return false when output is export but distDir is .next', () => {
      const config = {
        output: 'export',
        distDir: '.next',
      } as NextConfigComplete

      expect(hasCustomExportOutput(config)).toBe(false)
    })

    it('should return false when output is not export', () => {
      const config = {
        output: 'standalone',
        distDir: 'custom-dist',
      } as NextConfigComplete

      expect(hasCustomExportOutput(config)).toBe(false)
    })

    it('should return false when output is undefined', () => {
      const config = {
        distDir: 'custom-dist',
      } as NextConfigComplete

      expect(hasCustomExportOutput(config)).toBe(false)
    })

    it('should return false for default config', () => {
      const config = {
        distDir: '.next',
      } as NextConfigComplete

      expect(hasCustomExportOutput(config)).toBe(false)
    })

    it('should handle various custom distDir names', () => {
      const testCases = [
        { distDir: 'out', expected: true },
        { distDir: 'build', expected: true },
        { distDir: 'dist', expected: true },
        { distDir: '.output', expected: true },
        { distDir: '.next', expected: false },
      ]

      for (const { distDir, expected } of testCases) {
        const config = {
          output: 'export',
          distDir,
        } as NextConfigComplete

        expect(hasCustomExportOutput(config)).toBe(expected)
      }
    })
  })
})
