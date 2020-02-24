require('dotenv').config()

exports.default = {
  env: {
    TAKESHAPE_API_KEY: process.env.TAKESHAPE_API_KEY,
    TAKESHAPE_PROJECT: process.env.TAKESHAPE_PROJECT,
  },
}
