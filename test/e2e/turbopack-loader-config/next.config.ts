export default {
  turbopack: {
    rules: {
      // an empty condition should match
      'foo.js': {
        condition: {},
        // use the shorthand syntax
        loaders: ['./webpack-loader-replace-with-stub.cjs'],
      },
      'bar.js': [
        // this condition should not match
        {
          condition: 'foreign',
          loaders: [
            {
              loader: './webpack-loader-replace-with-stub.cjs',
              options: { returnValue: 'foreign' },
            },
          ],
        },
        // this condition should not match
        {
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
        {
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
        {
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
      ],
    },
  },
}
