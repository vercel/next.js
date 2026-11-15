function create(module, require) {
  module.exports = require('./ignored')
  return module.exports
}

module.exports = create({}, () => ({ value: 'shadowed' }))
