// eslint-disable-next-line import/no-extraneous-dependencies
const webpack = require('@rspack/core')
const path = require('path')

/**
 * @returns {webpack.Configuration}
 */
module.exports = () => {
  return {
    entry: {
      index: path.join(__dirname, 'src/cli/tui/index.tsx'),
    },
    target: 'node',
    mode: 'production',
    output: {
      path: path.join(__dirname, 'dist/compiled/tui'),
      filename: '[name].mjs',
      library: {
        type: 'module',
      },
      chunkFormat: 'module',
      module: true,
    },
    experiments: {
      outputModule: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      alias: {
        // Force production builds of React to avoid development-only initialization issues
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        'react/jsx-dev-runtime': require.resolve('react/jsx-runtime'),
        // Exclude react-devtools-core — ink only imports it when DEV=true,
        // which never applies in the bundled TUI (NODE_ENV=production).
        'react-devtools-core': false,
      },
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: 'automatic',
                    development: false,
                  },
                },
              },
            },
          },
        },
      ],
    },
    plugins: [
      // Define NODE_ENV to ensure production builds of React packages are used
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
    ],
    // Bundle everything including React for full isolation
    externals: [],
    optimization: {
      minimize: false,
      splitChunks: false,
      concatenateModules: false,
    },
  }
}
