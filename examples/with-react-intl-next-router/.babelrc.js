module.exports = {
  presets: ['next/babel'],
  plugins: [],
  env: {
    production: {
      plugins: [
        [
          'formatjs',
          {
            idInterpolationPattern: '[sha512:contenthash:base64:6]',
            removeDefaultMessage: true,
          },
        ],
      ],
    },
    development: {
      plugins: [
        [
          'formatjs',
          {
            idInterpolationPattern: '[sha512:contenthash:base64:6]',
          },
        ],
      ],
    },
  },
};
