/** @type {import('next').NextConfig} */
module.exports = {
  webpack(config) {
    // Override the default svg handling to use asset/resource
    config.module.rules.push({
      test: /\.svg$/,
      type: 'asset/resource',
    })
    return config
  },
}
