const prod = process.env.NODE_ENV === 'production'

module.exports = {
  'process.env.BACKEND_URL': prod
    ? 'https://api.example.com'
    : 'https://localhost:8080',
  'process.env.VARIABLE_EXAMPLE': process.env.VARIABLE_EXAMPLE
}
