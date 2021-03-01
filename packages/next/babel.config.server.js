module.exports = {
  presets: [
    '@babel/preset-typescript',
    ['@babel/preset-react', { useBuiltIns: true }],
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: {
          node: '8.3',
        },
        loose: true,
        // This is handled by the Next.js webpack config that will run next/babel over the same code.
        exclude: [
          'transform-typeof-symbol',
          'transform-async-to-generator',
          'transform-spread',
        ],
      },
    ],
  ],
  plugins: [
    'babel-plugin-dynamic-import-node',
    ['@babel/plugin-proposal-class-properties', { loose: true }],
  ],
  overrides: [
    {
      test: /\.tsx?$/,
      // eslint-disable-next-line import/no-extraneous-dependencies
      plugins: [require('@babel/plugin-proposal-numeric-separator').default],
    },
  ],
}
