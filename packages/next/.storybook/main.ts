import type { StorybookConfig } from '@storybook/react-webpack5'

import { join, dirname } from 'path'

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, 'package.json')))
}
const config: StorybookConfig = {
  stories: ['../src/next-devtools/dev-overlay/**/*.stories.tsx'],
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
  webpackFinal: async (config) => {
    // Exclude tailwind.css from all existing CSS rules
    config.module?.rules?.forEach((rule) => {
      if (
        rule &&
        typeof rule === 'object' &&
        'test' in rule &&
        rule.test?.toString().includes('css')
      ) {
        rule.exclude = rule.exclude
          ? [rule.exclude, /tailwind\.css$/].flat()
          : /tailwind\.css$/
      }
    })

    // Add our custom rule for tailwind.css
    config.module?.rules?.push({
      test: /tailwind\.css$/,
      use: [
        {
          loader: 'style-loader',
          options: {
            injectType: 'lazyStyleTag',
            insert: require.resolve('../next-devtools-inject-tailwind.js'),
          },
        },
        'css-loader',
        'postcss-loader',
      ],
    })
    return config
  },
}
export default config
