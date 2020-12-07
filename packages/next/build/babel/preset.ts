import { PluginItem } from 'next/dist/compiled/babel/core'
import { dirname } from 'path'
const env = process.env.NODE_ENV
const isProduction = env === 'production'
const isDevelopment = env === 'development'
const isTest = env === 'test'

type StyledJsxPlugin = [string, any] | string
type StyledJsxBabelOptions =
  | {
      plugins?: StyledJsxPlugin[]
      'babel-test'?: boolean
    }
  | undefined

// Resolve styled-jsx plugins
function styledJsxOptions(options: StyledJsxBabelOptions) {
  if (!options) {
    return {}
  }

  if (!Array.isArray(options.plugins)) {
    return options
  }

  options.plugins = options.plugins.map(
    (plugin: StyledJsxPlugin): StyledJsxPlugin => {
      if (Array.isArray(plugin)) {
        const [name, pluginOptions] = plugin
        return [require.resolve(name), pluginOptions]
      }

      return require.resolve(plugin)
    }
  )

  return options
}

type NextBabelPresetOptions = {
  'preset-env'?: any
  'preset-react'?: any
  'class-properties'?: any
  'transform-runtime'?: any
  'experimental-modern-preset'?: PluginItem
  'styled-jsx'?: StyledJsxBabelOptions
  'preset-typescript'?: any
}

type BabelPreset = {
  presets?: PluginItem[] | null
  plugins?: PluginItem[] | null
  sourceType?: 'script' | 'module' | 'unambiguous'
  overrides?: Array<{ test: RegExp } & Omit<BabelPreset, 'overrides'>>
}

// Taken from https://github.com/babel/babel/commit/d60c5e1736543a6eac4b549553e107a9ba967051#diff-b4beead8ad9195361b4537601cc22532R158
function supportsStaticESM(caller: any): boolean {
  return !!caller?.supportsStaticESM
}

module.exports = (
  api: any,
  options: NextBabelPresetOptions = {}
): BabelPreset => {
  const supportsESM = api.caller(supportsStaticESM)
  const isServer = api.caller((caller: any) => !!caller && caller.isServer)

  const useJsxRuntime =
    options['preset-react']?.runtime === 'automatic' ||
    (Boolean(api.caller((caller: any) => !!caller && caller.hasJsxRuntime)) &&
      options['preset-react']?.runtime !== 'classic')

  const isLaxModern =
    options['preset-env']?.targets &&
    options['preset-env'].targets.esmodules === true

  const presetEnvConfig = {
    // In the test environment `modules` is often needed to be set to true, babel figures that out by itself using the `'auto'` option
    // In production/development this option is set to `false` so that webpack can handle import/export with tree-shaking
    modules: 'auto',
    exclude: ['transform-typeof-symbol'],
    include: [
      '@babel/plugin-proposal-optional-chaining',
      '@babel/plugin-proposal-nullish-coalescing-operator',
    ],
    ...options['preset-env'],
  }

  // When transpiling for the server or tests, target the current Node version
  // if not explicitly specified:
  if (
    (isServer || isTest) &&
    (!presetEnvConfig.targets ||
      !(
        typeof presetEnvConfig.targets === 'object' &&
        'node' in presetEnvConfig.targets
      ))
  ) {
    presetEnvConfig.targets = {
      // Targets the current process' version of Node. This requires apps be
      // built and deployed on the same version of Node.
      node: 'current',
    }
  }

  // specify a preset to use instead of @babel/preset-env
  const customModernPreset =
    isLaxModern && options['experimental-modern-preset']

  return {
    sourceType: 'unambiguous',
    presets: [
      customModernPreset || [
        require('next/dist/compiled/babel/preset-env'),
        presetEnvConfig,
      ],
      [
        require('next/dist/compiled/babel/preset-react'),
        {
          // This adds @babel/plugin-transform-react-jsx-source and
          // @babel/plugin-transform-react-jsx-self automatically in development
          development: isDevelopment || isTest,
          ...(useJsxRuntime ? { runtime: 'automatic' } : { pragma: '__jsx' }),
          ...options['preset-react'],
        },
      ],
      [
        require('next/dist/compiled/babel/preset-typescript'),
        { allowNamespaces: true, ...options['preset-typescript'] },
      ],
    ],
    plugins: [
      !useJsxRuntime && [
        require('./plugins/jsx-pragma'),
        {
          // This produces the following injected import for modules containing JSX:
          //   import React from 'react';
          //   var __jsx = React.createElement;
          module: 'react',
          importAs: 'React',
          pragma: '__jsx',
          property: 'createElement',
        },
      ],
      [
        require('./plugins/optimize-hook-destructuring'),
        {
          // only optimize hook functions imported from React/Preact
          lib: true,
        },
      ],
      require('next/dist/compiled/babel/plugin-syntax-dynamic-import'),
      require('./plugins/react-loadable-plugin'),
      [
        require('next/dist/compiled/babel/plugin-proposal-class-properties'),
        options['class-properties'] || {},
      ],
      [
        require('next/dist/compiled/babel/plugin-proposal-object-rest-spread'),
        {
          useBuiltIns: true,
        },
      ],
      !isServer && [
        require('next/dist/compiled/babel/plugin-transform-runtime'),
        {
          corejs: false,
          helpers: true,
          regenerator: true,
          useESModules: supportsESM && presetEnvConfig.modules !== 'commonjs',
          absoluteRuntime: process.versions.pnp
            ? dirname(require.resolve('@babel/runtime/package.json'))
            : undefined,
          ...options['transform-runtime'],
        },
      ],
      [
        isTest && options['styled-jsx'] && options['styled-jsx']['babel-test']
          ? require('styled-jsx/babel-test')
          : require('styled-jsx/babel'),
        styledJsxOptions(options['styled-jsx']),
      ],
      require('./plugins/amp-attributes'),
      isProduction && [
        require('babel-plugin-transform-react-remove-prop-types'),
        {
          removeImport: true,
        },
      ],
      isServer && require('next/dist/compiled/babel/plugin-syntax-bigint'),
      // Always compile numeric separator because the resulting number is
      // smaller.
      require('next/dist/compiled/babel/plugin-proposal-numeric-separator'),
      require('next/dist/compiled/babel/plugin-proposal-export-namespace-from'),
    ].filter(Boolean),
  }
}
