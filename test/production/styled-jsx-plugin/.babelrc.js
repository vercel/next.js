console.log('hello from babel!')

module.exports = {
  presets: [
    [
      'next/babel',
      {
        'styled-jsx': {
          plugins: [require.resolve('styled-jsx-plugin-postcss')],
        },
      },
    ],
  ],
}
