require('dotenv').config() /* For local environment var configuration */

module.exports = {
  env: {
    MONGO_DBURI: process.env.MONGO_DBURI,
    VERCEL_URL: process.env.VERCEL_URL,
  },
}
