const prod = process.env.NODE_ENV === 'production'

module.exports = {
  'MY_ENV_VARIABLE': prod ? 'production' : 'development'
}
