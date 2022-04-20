import { loadEnvConfig } from '@next/env'
import { resolve, join } from 'path'
import loadConfig from '../../server/config'
import { PHASE_TEST } from '../../shared/lib/constants'
import loadJsConfig from '../load-jsconfig'
import * as Log from '../output/log'

async function getConfig(dir: string) {
  const conf = await loadConfig(PHASE_TEST, dir)
  return conf
}

/**
 * Loads closest package.json in the directory hierarchy
 */
function loadClosestPackageJson(dir: string, attempts = 1): any {
  if (attempts > 5) {
    throw new Error("Can't resolve main package.json file")
  }
  var mainPath = attempts === 1 ? './' : Array(attempts).join('../')
  try {
    return require(join(dir, mainPath + 'package.json'))
  } catch (e) {
    return loadClosestPackageJson(dir, attempts + 1)
  }
}

/*
// Usage in jest.config.js
const nextJest = require('next/jest');

// Optionally provide path to Next.js app which will enable loading next.config.js and .env files
const createJestConfig = nextJest({ dir })

// Any custom config you want to pass to Jest
const customJestConfig = {
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
}

// createJestConfig is exported in this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
*/
export default function nextJest(options: { dir?: string } = {}) {
  // createJestConfig
  return (customJestConfig?: any) => {
    // Function that is provided as the module.exports of jest.config.js
    // Will be called and awaited by Jest
    return async () => {
      let nextConfig
      let jsConfig
      let resolvedBaseUrl
      let isEsmProject = false
      if (options.dir) {
        const resolvedDir = resolve(options.dir)
        const packageConfig = loadClosestPackageJson(resolvedDir)
        isEsmProject = packageConfig.type === 'module'

        nextConfig = await getConfig(resolvedDir)
        loadEnvConfig(resolvedDir, false, Log)
        // TODO: revisit when bug in SWC is fixed that strips `.css`
        const result = await loadJsConfig(resolvedDir, nextConfig)
        jsConfig = result.jsConfig
        resolvedBaseUrl = result.resolvedBaseUrl
      }
      // Ensure provided async config is supported
      const resolvedJestConfig =
        (typeof customJestConfig === 'function'
          ? await customJestConfig()
          : customJestConfig) ?? {}

      return {
        ...resolvedJestConfig,

        moduleNameMapper: {
          // Custom config will be able to override the default mappings
          // moduleNameMapper is matched top to bottom hence why this has to be before Next.js internal rules
          ...(resolvedJestConfig.moduleNameMapper || {}),

          // Handle CSS imports (with CSS modules)
          // https://jestjs.io/docs/webpack#mocking-css-modules
          '^.+\\.module\\.(css|sass|scss)$':
            require.resolve('./object-proxy.js'),

          // Handle CSS imports (without CSS modules)
          '^.+\\.(css|sass|scss)$': require.resolve('./__mocks__/styleMock.js'),

          // Handle image imports
          '^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$': require.resolve(
            `./__mocks__/fileMock.js`
          ),
        },
        testPathIgnorePatterns: [
          // Don't look for tests in node_modules
          '/node_modules/',
          // Don't look for tests in the Next.js build output
          '/.next/',
          // Custom config can append to testPathIgnorePatterns but not modify it
          // This is to ensure `.next` and `node_modules` are always excluded
          ...(resolvedJestConfig.testPathIgnorePatterns || []),
        ],

        transform: {
          // Use SWC to compile tests
          '^.+\\.(js|jsx|ts|tsx|mjs)$': [
            require.resolve('../swc/jest-transformer'),
            {
              nextConfig,
              jsConfig,
              resolvedBaseUrl,
              isEsmProject,
            },
          ],
          // Allow for appending/overriding the default transforms
          ...(resolvedJestConfig.transform || {}),
        },

        transformIgnorePatterns: [
          // To match Next.js behavior node_modules is not transformed
          '/node_modules/',
          // CSS modules are mocked so they don't need to be transformed
          '^.+\\.module\\.(css|sass|scss)$',

          // Custom config can append to transformIgnorePatterns but not modify it
          // This is to ensure `node_modules` and .module.css/sass/scss are always excluded
          ...(resolvedJestConfig.transformIgnorePatterns || []),
        ],
        watchPathIgnorePatterns: [
          // Don't re-run tests when the Next.js build output changes
          '/.next/',
          ...(resolvedJestConfig.watchPathIgnorePatterns || []),
        ],
      }
    }
  }
}
