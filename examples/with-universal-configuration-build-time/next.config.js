const prod = process.env.NODE_ENV === 'production'

module.exports = {
  env: {
    BACKEND_URL: prod ? 'https://api.example.com' : 'https://localhost:8080',
  },
}
