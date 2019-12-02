require('dotenv').config()

const path = require('path')
const Dotenv = require('dotenv-webpack')

module.exports = {
  webpack: config => {

    const originalEntry = config.entry;
    config.entry = async () => {
      const entries = await originalEntry();
      const keys = Object.keys(entries);
      keys.forEach(key => {
        if (key.includes('__generated__')) {
          delete entries[key];
        }
      });

      return entries;
    };
    config.plugins = config.plugins || []

    config.plugins = [
      ...config.plugins,

      // Read the .env file
      new Dotenv({
        path: path.join(__dirname, '.env'),
        systemvars: true,
      }),
    ]

    return config
  },
}
