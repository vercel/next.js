require('dotenv').config({ path: '.env.local' })
const { parse } = require('pg-connection-string')

const options = {}

if (process.env.DATABASE_URL) {
  const { host, database, user, password, ssl } = parse(
    process.env.DATABASE_URL
  )

  process.env.PGHOST = host
  process.env.PGDATABASE = database
  process.env.PGUSERNAME = user
  process.env.PGPASSWORD = password

  options.ssl = ssl
}

module.exports = options
