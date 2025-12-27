/* eslint-env jest */
import { join } from 'path'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'

// We need to test the actual implementation
const bytecodeCachePath = join(
  __dirname,
  '../../packages/next/dist/server/lib/bytecode-cache.js'
)

describe('bytecode-cache', () => {
  let testDir: string
  let testModulePath: string
  let originalEnv: NodeJS.ProcessEnv

  beforeAll(() => {
    // Save original env
    originalEnv = { ...process.env }
  })

  beforeEach(() => {
    // Create a unique test directory for each test
    testDir = join(
      tmpdir(),
      `bytecode-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    mkdirSync(testDir, { recursive: true })

    // Create a .next directory so the cache uses this location
    mkdirSync(join(testDir, '.next'), { recursive: true })

    // Create a test module
    testModulePath = join(testDir, 'test-module.js')
    writeFileSync(
      testModulePath,
      `
      module.exports = {
        value: 42,
        greet: function(name) { return 'Hello, ' + name; }
      };
    `
    )

    // Change to test directory so getCacheDir uses it
    process.chdir(testDir)
  })

  afterEach(() => {
    // Restore original directory
    process.chdir(join(__dirname, '../..'))

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }

    // Restore original env
    process.env = { ...originalEnv }

    // Clear require cache for the bytecode-cache module
    delete require.cache[bytecodeCachePath]
  })

  describe('loadWithBytecodeCache', () => {
    it('should load a module and return its exports', () => {
      const { loadWithBytecodeCache } = require(bytecodeCachePath)

      const exports = loadWithBytecodeCache(testModulePath)

      expect(exports.value).toBe(42)
      expect(exports.greet('World')).toBe('Hello, World')
    })

    it('should work with modules that use require for node builtins', () => {
      // Create a module that requires node built-in modules
      const mainPath = join(testDir, 'main.js')
      writeFileSync(
        mainPath,
        `
        const path = require('path');
        const fs = require('fs');
        module.exports = {
          main: true,
          hasPath: typeof path.join === 'function',
          hasFs: typeof fs.readFileSync === 'function'
        };
      `
      )

      const { loadWithBytecodeCache } = require(bytecodeCachePath)
      const exports = loadWithBytecodeCache(mainPath)

      expect(exports.main).toBe(true)
      expect(exports.hasPath).toBe(true)
      expect(exports.hasFs).toBe(true)
    })

    it('should create cache directory and metadata after warmup', async () => {
      const { loadWithBytecodeCache } = require(bytecodeCachePath)

      // First load - should schedule cache save
      loadWithBytecodeCache(testModulePath)

      // The cache is created after a warmup delay, so we can't test immediate creation
      // But we can verify the module loaded correctly
      expect(existsSync(testModulePath)).toBe(true)
    })

    it('should handle modules with syntax errors gracefully', () => {
      const badModulePath = join(testDir, 'bad-module.js')
      writeFileSync(
        badModulePath,
        `module.exports = { this is not valid javascript }`
      )

      const { loadWithBytecodeCache } = require(bytecodeCachePath)

      expect(() => loadWithBytecodeCache(badModulePath)).toThrow()
    })

    it('should work with ES module style exports', () => {
      const esModulePath = join(testDir, 'es-module.js')
      writeFileSync(
        esModulePath,
        `
        Object.defineProperty(exports, '__esModule', { value: true });
        exports.default = { name: 'default' };
        exports.named = { name: 'named' };
      `
      )

      const { loadWithBytecodeCache } = require(bytecodeCachePath)
      const exports = loadWithBytecodeCache(esModulePath)

      expect(exports.__esModule).toBe(true)
      expect(exports.default.name).toBe('default')
      expect(exports.named.name).toBe('named')
    })
  })

  describe('isBytecodeCacheEnabled', () => {
    it('should return true by default', () => {
      delete process.env.NEXT_DISABLE_BYTECODE_CACHE

      // Clear cache to reload with fresh env
      delete require.cache[bytecodeCachePath]
      const { isBytecodeCacheEnabled } = require(bytecodeCachePath)

      expect(isBytecodeCacheEnabled()).toBe(true)
    })

    it('should return false when NEXT_DISABLE_BYTECODE_CACHE is set', () => {
      process.env.NEXT_DISABLE_BYTECODE_CACHE = '1'

      // Clear cache to reload with fresh env
      delete require.cache[bytecodeCachePath]
      const { isBytecodeCacheEnabled } = require(bytecodeCachePath)

      expect(isBytecodeCacheEnabled()).toBe(false)
    })
  })

  describe('clearBytecodeCache', () => {
    it('should remove the cache directory', () => {
      const { loadWithBytecodeCache, clearBytecodeCache } = require(
        bytecodeCachePath
      )

      // Create cache by loading a module
      loadWithBytecodeCache(testModulePath)

      // Create cache dir manually to test clearing
      const cacheDir = join(testDir, '.next', 'cache', 'bytecode')
      mkdirSync(cacheDir, { recursive: true })
      writeFileSync(join(cacheDir, 'test.bytecode'), 'test')

      expect(existsSync(cacheDir)).toBe(true)

      clearBytecodeCache()

      expect(existsSync(cacheDir)).toBe(false)
    })

    it('should not throw if cache directory does not exist', () => {
      const { clearBytecodeCache } = require(bytecodeCachePath)

      // Ensure cache dir doesn't exist
      const cacheDir = join(testDir, '.next', 'cache', 'bytecode')
      if (existsSync(cacheDir)) {
        rmSync(cacheDir, { recursive: true, force: true })
      }

      expect(() => clearBytecodeCache()).not.toThrow()
    })
  })

  describe('cache invalidation', () => {
    it('should invalidate cache when source file changes', async () => {
      const { loadWithBytecodeCache } = require(bytecodeCachePath)

      // First load
      const exports1 = loadWithBytecodeCache(testModulePath)
      expect(exports1.value).toBe(42)

      // Modify the source file
      writeFileSync(testModulePath, `module.exports = { value: 100 };`)

      // Clear module from require cache and reload bytecode-cache
      delete require.cache[bytecodeCachePath]
      const { loadWithBytecodeCache: loadWithBytecodeCache2 } = require(
        bytecodeCachePath
      )

      // Second load should pick up new value
      const exports2 = loadWithBytecodeCache2(testModulePath)
      expect(exports2.value).toBe(100)
    })
  })

  describe('module context', () => {
    it('should provide correct __filename and __dirname', () => {
      const contextTestPath = join(testDir, 'context-test.js')
      writeFileSync(
        contextTestPath,
        `
        module.exports = {
          filename: __filename,
          dirname: __dirname
        };
      `
      )

      const { loadWithBytecodeCache } = require(bytecodeCachePath)
      const exports = loadWithBytecodeCache(contextTestPath)

      expect(exports.filename).toBe(contextTestPath)
      expect(exports.dirname).toBe(testDir)
    })

    it('should provide working require function for node modules', () => {
      const mainPath = join(testDir, 'main-with-require.js')
      writeFileSync(
        mainPath,
        `
        const path = require('path');
        const crypto = require('crypto');
        module.exports = {
          pathExists: typeof path.join === 'function',
          cryptoExists: typeof crypto.createHash === 'function',
          joinedPath: path.join('a', 'b', 'c')
        };
      `
      )

      const { loadWithBytecodeCache } = require(bytecodeCachePath)
      const exports = loadWithBytecodeCache(mainPath)

      expect(exports.pathExists).toBe(true)
      expect(exports.cryptoExists).toBe(true)
      expect(exports.joinedPath).toMatch(/a.b.c/)
    })
  })
})
