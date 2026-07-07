const config = {
  webpack: (config, { defaultLoaders }) => {
    config.module.rules.push({
      test: /\.css$/,
      use: [
        defaultLoaders.babel,
        {
          loader: require('styled-jsx/webpack').loader,
          options: {
            type: (fileName, options) => options.query.type || 'scoped',
          },
        },
      ],
    })

    return config
  },
}

module.exports = config
