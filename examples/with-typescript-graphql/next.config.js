/** @type {import('next').NextConfig} */
module.exports = {
  webpack(config, options) {
    config.module.rules.push({
      test: /\.ya?ml$/,
      type: 'json',
      use: 'yaml-loader',
    })

    return config
  },
}
