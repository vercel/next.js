module.exports = {
  presets: [
    '@babel/preset-typescript',
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: {
          esmodules: true,
        },
        bugfixes: true,
        loose: true,
        // This is handled by the Next.js webpack config that will run next/babel over the same code.
        exclude: [
          'transform-typeof-symbol',
          'transform-async-to-generator',
          'transform-spread',
        ],
      },
    ],
    ['@babel/preset-react', { useBuiltIns: true }],
  ],
  plugins: [
    '@babel/plugin-syntax-dynamic-import',
    ['@babel/plugin-proposal-class-properties', { loose: true }],
    [
      '@babel/plugin-transform-runtime',
      {
        corejs: false,
        helpers: true,
        regenerator: false,
        useESModules: false,
      },
    ],
  ],
  overrides: [
    {
      test: /\.tsx?$/,
      // eslint-disable-next-line import/no-extraneous-dependencies
      plugins: [require('@babel/plugin-proposal-numeric-separator').default],
    },
  ],
}
