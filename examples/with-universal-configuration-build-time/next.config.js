require('dotenv').config()

const prod = process.env.NODE_ENV === 'production'

module.exports = {
  env: {
    TEST: process.env.TEST,
    BACKEND_URL: prod ? 'https://api.example.com' : 'https://localhost:8080'
  }
}
