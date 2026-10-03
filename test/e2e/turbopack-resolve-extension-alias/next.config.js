const alias = {
  '.js': ['.ts', '.tsx', '.js'],
}

/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    resolveExtensionAlias: alias,
  },
  webpack(config) {
    config.resolve.extensionAlias = alias
    return config
  },
}
