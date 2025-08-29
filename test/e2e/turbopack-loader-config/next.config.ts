export default {
  turbopack: {
    rules: {
      // an empty condition should match
      'foo.js': {
        condition: {},
        // use the shorthand syntax
        loaders: ['./webpack-loader-replace-with-stub.cjs'],
      },
      // this condition should not match
      'bar.js': {
        condition: 'foreign',
        loaders: [
          {
            loader: './webpack-loader-replace-with-stub.cjs',
            options: { returnValue: 'foreign' },
          },
        ],
      },
      // this condition should not match
      '{bar}.js': {
        condition: {
          not: { content: /export/ },
        },
        loaders: [
          {
            loader: './webpack-loader-replace-with-stub.cjs',
            options: { returnValue: 'missing export' },
          },
        ],
      },
      // this should match on dev
      '{bar.js}': {
        condition: {
          any: [
            {
              all: ['development', { not: { not: { content: /export/ } } }],
            },
          ],
        },
        loaders: [
          {
            loader: './webpack-loader-replace-with-stub.cjs',
            options: { returnValue: 'has export substring on dev' },
          },
        ],
      },
      // this should match on production
      'bar.{js}': {
        condition: {
          all: [{ not: 'development' }, { content: /export/ }],
        },
        loaders: [
          {
            loader: './webpack-loader-replace-with-stub.cjs',
            options: { returnValue: 'has export substring on prod' },
          },
        ],
      },
    },
  },
}
