export default {
  turbopack: {
    rules: {
      // an empty condition should match
      'foo.js': {
        condition: {},
        loaders: [
          // use the shorthand syntax
          './webpack-loader-replace-with-stub.cjs',
          {
            loader: './webpack-loader-replace-with-stub.cjs',
            options: { returnValue: 'untransformed intermediate value' },
          },
        ],
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
                all: [
                  'development',
                  { not: { not: { query: /test=hi/, content: /export/ } } },
                ],
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
            all: [
              { not: 'development' },
              { query: /test=hi/, content: /export/ },
            ],
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
