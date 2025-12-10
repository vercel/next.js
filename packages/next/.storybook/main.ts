import type { StorybookConfig } from '@storybook/react-webpack5'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, 'package.json')))
}
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const config: StorybookConfig = {
  stories: ['../src/next-devtools/**/*.stories.tsx'],
  addons: [
    getAbsolutePath('@storybook/addon-webpack5-compiler-swc'),
    getAbsolutePath('@storybook/addon-essentials'),
    getAbsolutePath('@storybook/addon-interactions'),
    getAbsolutePath('@storybook/addon-a11y'),
  ],
  framework: {
    name: getAbsolutePath('@storybook/react-webpack5'),
    options: {
      builder: {
        useSWC: true,
      },
    },
  },
  swc: () => ({
    jsc: {
      transform: {
        react: {
          runtime: 'automatic',
        },
      },
    },
  }),
  webpackFinal: async (webpackConfig) => {
    // Find and override CSS rule to use the devtool style injection
    const cssRule = webpackConfig.module?.rules?.find((rule) => {
      if (typeof rule !== 'object' || !rule) return false
      if ('test' in rule && rule.test instanceof RegExp) {
        return rule.test.test('.css')
      }
      return false
    })

    if (
      cssRule &&
      typeof cssRule === 'object' &&
      'use' in cssRule &&
      Array.isArray(cssRule.use)
    ) {
      // Find the style-loader in the use array
      const styleLoaderIndex = cssRule.use.findIndex((loader) => {
        if (typeof loader === 'string') return loader.includes('style-loader')
        if (typeof loader === 'object' && loader && 'loader' in loader) {
          return loader.loader?.includes('style-loader')
        }
        return false
      })

      if (styleLoaderIndex !== -1) {
        // Replace with our custom configuration
        cssRule.use[styleLoaderIndex] = {
          loader: require.resolve('style-loader'),
          options: {
            injectType: 'styleTag',
            insert: resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../src/build/webpack/loaders/devtool/devtool-style-inject.js'
            ),
          },
        }
      }
    }

    return webpackConfig
  },
}

export default config
