/**
 * Test for issue #46078: TypeScript moduleResolution=nodenext support
 * Validates that Next.js package.json has proper exports field for ESM compatibility
 */

import { describe, test, expect } from '@jest/globals'
import fs from 'fs'
import path from 'path'

describe('package.json exports field', () => {
  const packageJsonPath = path.join(__dirname, '../../packages/next/package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

  test('should have exports field defined', () => {
    expect(packageJson.exports).toBeDefined()
    expect(typeof packageJson.exports).toBe('object')
  })

  test('should export main entry point', () => {
    expect(packageJson.exports['.']).toBeDefined()
    expect(packageJson.exports['.'].default).toBe('./dist/server/next.js')
    expect(packageJson.exports['.'].types).toBe('./index.d.ts')
  })

  test('should export all core modules with types', () => {
    const coreModules = [
      './head',
      './image',
      './link',
      './router',
      './script',
      './navigation',
      './headers',
      './server',
      './document',
      './app',
      './dynamic',
      './form',
      './cache',
      './web-vitals'
    ]

    for (const moduleName of coreModules) {
      expect(packageJson.exports[moduleName]).toBeDefined()
      expect(packageJson.exports[moduleName].default).toMatch(/\.js$/)
      expect(packageJson.exports[moduleName].types).toMatch(/\.d\.ts$/)
    }
  })

  test('should export compat modules', () => {
    expect(packageJson.exports['./compat/router']).toBeDefined()
    expect(packageJson.exports['./compat/router'].default).toBe('./compat/router.js')
    expect(packageJson.exports['./compat/router'].types).toBe('./compat/router.d.ts')
  })

  test('should export legacy modules', () => {
    expect(packageJson.exports['./legacy/image']).toBeDefined()
    expect(packageJson.exports['./legacy/image'].default).toBe('./legacy/image.js')
    expect(packageJson.exports['./legacy/image'].types).toBe('./legacy/image.d.ts')
  })

  test('should export font modules', () => {
    expect(packageJson.exports['./font/google']).toBeDefined()
    expect(packageJson.exports['./font/local']).toBeDefined()
  })

  test('should export experimental modules with types', () => {
    const experimentalModules = [
      './experimental/testing/server',
      './experimental/testmode/playwright',
      './experimental/testmode/playwright/msw',
      './experimental/testmode/proxy'
    ]

    for (const moduleName of experimentalModules) {
      expect(packageJson.exports[moduleName]).toBeDefined()
      expect(packageJson.exports[moduleName].default).toMatch(/\.js$/)
      expect(packageJson.exports[moduleName].types).toMatch(/\.d\.ts$/)
    }
  })

  test('should export package.json for tools', () => {
    expect(packageJson.exports['./package.json']).toBe('./package.json')
  })

  test('exports should match files list', () => {
    const files = new Set(packageJson.files)
    
    // Verify all exported .js files are in the files list
    for (const [key, value] of Object.entries(packageJson.exports)) {
      if (key === './package.json' || typeof value === 'string') continue
      
      const exportEntry = value as { default?: string; types?: string }
      if (exportEntry.default) {
        const file = exportEntry.default.replace('./', '').split('/')[0]
        if (file !== 'dist') {
          // For root-level files (e.g., head.js)
          const jsFile = exportEntry.default.replace('./', '')
          expect(files.has(jsFile) || files.has(file)).toBe(true)
        }
      }
    }
  })
})
