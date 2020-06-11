require('dotenv').config()

module.exports = {
  env: {
    TAKESHAPE_API_KEY: process.env.TAKESHAPE_API_KEY,
    TAKESHAPE_PROJECT_ID: process.env.TAKESHAPE_PROJECT_ID,
  },
}
