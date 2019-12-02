require('dotenv').config()

const path = require('path')
const Dotenv = require('dotenv-webpack')

module.exports = {
  webpack: (config, { isServer }) => {
    const originalEntry = config.entry
    config.entry = async () => {
      const entries = await originalEntry()
      const keys = Object.keys(entries)
      keys.forEach(key => {
        if (key.includes('__generated__')) {
          delete entries[key]
        }
      })

      return entries
    }

    config.plugins.push(
      new Dotenv({
        path: path.join(__dirname, '.env'),
        systemvars: true,
      })
    )

    return config
  },
}
