const nextEnv = require('next-env')
const dotenvLoad = require('dotenv-load')

dotenvLoad()

const withNextEnv = nextEnv()

module.exports = withNextEnv({
  env: {
    MAGIC_PUBLISHABLE_KEY: process.env.MAGIC_PUBLISHABLE_KEY,
    MAGIC_SECRET_KEY: process.env.MAGIC_SECRET_KEY,
  },
  devIndicators: {
    autoPrerender: false,
  },
})
