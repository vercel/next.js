import type { PluginItem } from 'next/dist/compiled/babel/core'
import { dirname } from 'path'

const isLoadIntentTest = process.env.NODE_ENV === 'test'
const isLoadIntentDevelopment = process.env.NODE_ENV === 'development'

type StyledJsxPlugin = [string, any] | string
type StyledJsxBabelOptions =
  | {
      plugins?: StyledJsxPlugin[]
      styleModule?: string
      'babel-test'?: boolean
    }
  | undefined

// Resolve styled-jsx plugins
function styledJsxOptions(options: StyledJsxBabelOptions) {
  options = options || {}
  options.styleModule = 'styled-jsx/style'

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
  'styled-jsx'?: StyledJsxBabelOptions
  /**
   * `syntax-typescript` is a subset of `preset-typescript`.
   *
   * - When babel is used in "standalone" mode (e.g. alongside SWC when using
   *   react-compiler or turbopack) we'll prefer the options in
   *   'syntax-typescript`, and fall back to `preset-typescript`.
   *
   * - When babel is used in "default" mode (e.g. with a babel config in
   *   webpack) we'll prefer the options in `preset-typescript`, and fall back
   *   to `syntax-typescript`.
   */
  'preset-typescript'?: any
  'syntax-typescript'?: {
    disallowAmbiguousJSXLike?: boolean
    dts?: boolean
    isTSX?: boolean
    allExtensions?: boolean
    ignoreExtensions?: boolean
  }
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

/**
 * HACK: A drop-in replacement for `@babel/preset-typescript` that only enables
 * `@babel/plugin-syntax-typescript` and does not transform the typescript.
 *
 * This is used for standalone mode, where Babel is being used alongside SWC
 * (i.e. Turbopack or with React Compiler on webpack).
 *
 * This should match the logic/behavior here:
 * https://github.com/babel/babel/blob/7f57d3a2e97b7e2800fb82cff9284a3591377971/packages/babel-preset-typescript/src/index.ts#L63
 */
function presetTypescriptSyntaxOnly(_api: unknown, options: any) {
  const { allExtensions, ignoreExtensions, ...restOptions } = options
  const disableExtensionDetect = allExtensions || ignoreExtensions

  function getPlugins(isTSX: boolean, disallowAmbiguousJSXLike: boolean) {
    return [
      [
        require('next/dist/compiled/babel/plugin-syntax-typescript') as typeof import('next/dist/compiled/babel/plugin-syntax-typescript'),
        {
          isTSX,
          disallowAmbiguousJSXLike,
          ...restOptions,
        },
      ],
    ]
  }

  return {
    plugins: [],
    overrides: disableExtensionDetect
      ? [
          {
            plugins: getPlugins(
              options.isTSX,
              options.disallowAmbiguousJSXLike
            ),
          },
        ]
      : // Only set 'test' if explicitly requested, since it requires that
        // Babel is being called with a filename.
        [
          {
            test: /\.ts$/,
            plugins: getPlugins(false, false),
          },
          {
            test: /\.mts$/,
            sourceType: 'module',
            plugins: getPlugins(false, true),
          },
          {
            test: /\.cts$/,
            sourceType: 'unambiguous',
            plugins: getPlugins(false, true),
          },
          {
            test: /\.tsx$/,
            plugins: getPlugins(true, false),
          },
        ],
  }
}

export default (
  api: any,
  options: NextBabelPresetOptions = {}
): BabelPreset => {
  const isStandalone = api.caller(
    // NOTE: `transformMode` may be undefined if the user configured `babel-loader` themselves. In
    // this case, we should assume we're in 'default' mode.
    (caller: any) => !!caller && caller.transformMode === 'standalone'
  )
  const isServer = api.caller((caller: any) => !!caller && caller.isServer)

  // syntax plugins that are used in both standalone and default modes
  const sharedSyntaxPlugins = [
    require('next/dist/compiled/babel/plugin-syntax-dynamic-import') as typeof import('next/dist/compiled/babel/plugin-syntax-dynamic-import'),
    [
      require('next/dist/compiled/babel/plugin-syntax-import-attributes') as typeof import('next/dist/compiled/babel/plugin-syntax-import-attributes'),
      {
        deprecatedAssertSyntax: true,
      },
    ],
    (isStandalone || isServer) &&
      (require('next/dist/compiled/babel/plugin-syntax-bigint') as typeof import('next/dist/compiled/babel/plugin-syntax-bigint')),
  ].filter(Boolean)

  if (isStandalone) {
    // Just enable a few syntax plugins, we'll let SWC handle any of the downleveling or
    // next.js-specific transforms.
    return {
      sourceType: 'unambiguous',
      presets: [
        [
          presetTypescriptSyntaxOnly,
          options['syntax-typescript'] ?? options['preset-typescript'] ?? {},
        ],
      ],
      plugins: [
        require('next/dist/compiled/babel/plugin-syntax-jsx') as typeof import('next/dist/compiled/babel/plugin-syntax-jsx'),
        ...sharedSyntaxPlugins,
      ],
    }
  }

  const supportsESM = api.caller(supportsStaticESM)
  const isCallerDevelopment = api.caller((caller: any) => caller?.isDev)

  // Look at external intent if used without a caller (e.g. via Jest):
  const isTest = isCallerDevelopment == null && isLoadIntentTest

  // Look at external intent if used without a caller (e.g. Storybook):
  const isDevelopment =
    isCallerDevelopment === true ||
    (isCallerDevelopment == null && isLoadIntentDevelopment)

  // Default to production mode if not `test` nor `development`:
  const isProduction = !(isTest || isDevelopment)

  const isBabelLoader = api.caller(
    (caller: any) =>
      !!caller &&
      (caller.name === 'babel-loader' ||
        caller.name === 'next-babel-turbo-loader')
  )

  const useJsxRuntime =
    options['preset-react']?.runtime === 'automatic' ||
    (Boolean(api.caller((caller: any) => !!caller && caller.hasJsxRuntime)) &&
      options['preset-react']?.runtime !== 'classic')

  const presetEnvConfig = {
    // In the test environment `modules` is often needed to be set to true, babel figures that out by itself using the `'auto'` option
    // In production/development this option is set to `false` so that webpack can handle import/export with tree-shaking
    modules: 'auto',
    exclude: ['transform-typeof-symbol'],
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
      // This is the same as using "current" but explicit
      node: process.versions.node,
    }
  }

  const runtimeModuleName = isBabelLoader
    ? 'next/dist/compiled/@babel/runtime'
    : null
  return {
    sourceType: 'unambiguous',
    presets: [
      [
        require('next/dist/compiled/babel/preset-env') as typeof import('next/dist/compiled/babel/preset-env'),
        presetEnvConfig,
      ],
      [
        require('next/dist/compiled/babel/preset-react') as typeof import('next/dist/compiled/babel/preset-react'),
        {
          // This adds @babel/plugin-transform-react-jsx-source and
          // @babel/plugin-transform-react-jsx-self automatically in development
          development: isDevelopment || isTest,
          ...(useJsxRuntime ? { runtime: 'automatic' } : { pragma: '__jsx' }),
          ...options['preset-react'],
        },
      ],
      [
        require('next/dist/compiled/babel/preset-typescript') as typeof import('next/dist/compiled/babel/preset-typescript'),
        {
          allowNamespaces: true,
          ...(options['preset-typescript'] || options['syntax-typescript']),
        },
      ],
    ],
    plugins: [
      ...sharedSyntaxPlugins,
      !useJsxRuntime && [
        require('./plugins/jsx-pragma') as typeof import('./plugins/jsx-pragma'),
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
        require('./plugins/optimize-hook-destructuring') as typeof import('./plugins/optimize-hook-destructuring'),
        {
          // only optimize hook functions imported from React/Preact
          lib: true,
        },
      ],
      require('./plugins/react-loadable-plugin') as typeof import('./plugins/react-loadable-plugin'),
      // only enable this plugin if custom config for it was provided
      // otherwise we will only enable it if their browserslist triggers
      // preset-env to pull it in
      options['class-properties'] && [
        require('next/dist/compiled/babel/plugin-proposal-class-properties') as typeof import('next/dist/compiled/babel/plugin-proposal-class-properties'),
        options['class-properties'] || {},
      ],
      [
        require('next/dist/compiled/babel/plugin-proposal-object-rest-spread') as typeof import('next/dist/compiled/babel/plugin-proposal-object-rest-spread'),
        {
          useBuiltIns: true,
        },
      ],
      !isServer && [
        require('next/dist/compiled/babel/plugin-transform-runtime') as typeof import('next/dist/compiled/babel/plugin-transform-runtime'),
        {
          corejs: false,
          helpers: true,
          regenerator: true,
          useESModules: supportsESM && presetEnvConfig.modules !== 'commonjs',
          absoluteRuntime:
            runtimeModuleName != null
              ? dirname(require.resolve(`${runtimeModuleName}/package.json`))
              : undefined,
          // regenerator needs `moduleName` to be set in addition to
          // `absoluteRuntime`.
          moduleName: runtimeModuleName,
          ...options['transform-runtime'],
        },
      ],
      [
        isTest && options['styled-jsx'] && options['styled-jsx']['babel-test']
          ? (require('styled-jsx/babel-test') as typeof import('styled-jsx/babel-test'))
          : (require('styled-jsx/babel') as typeof import('styled-jsx/babel')),
        styledJsxOptions(options['styled-jsx']),
      ],
      isProduction && [
        require('next/dist/compiled/babel/plugin-transform-react-remove-prop-types') as typeof import('next/dist/compiled/babel/plugin-transform-react-remove-prop-types'),
        {
          removeImport: true,
        },
      ],
      // Always compile numeric separator because the resulting number is
      // smaller.
      require('next/dist/compiled/babel/plugin-proposal-numeric-separator') as typeof import('next/dist/compiled/babel/plugin-proposal-numeric-separator'),
      require('next/dist/compiled/babel/plugin-proposal-export-namespace-from') as typeof import('next/dist/compiled/babel/plugin-proposal-export-namespace-from'),
    ].filter(Boolean),
  }
}
