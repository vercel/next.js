const parent = require('../next.config')

module.exports = {
  ...parent,
  experimental: {
    ...parent.experimental,
    modern: true,
  },
}
