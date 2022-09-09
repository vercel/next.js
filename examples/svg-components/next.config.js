/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      // use this if you don't need custom options.
      // use: ['@svgr/webpack'],
      // docs options @svgr - https://react-svgr.com/docs/options
      use: {
        loader: "@svgr/webpack",
        options: {
          dimensions: false,
          svgoConfig: {
            plugins: [
              {
                name: "preset-default",
                params: {
                  overrides: {
                    removeViewBox: false,
                  },
                },
              },
            ],
          },
        },
      },
    })

    return config
  },
}
