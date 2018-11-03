module.exports = {
  keys: 'bayunjiang',
  middleware: ['next'],
  next: {
    dev: process.env.NODE_ENV !== 'production'
  }
}
