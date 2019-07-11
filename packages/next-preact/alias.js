const moduleAlias = require('module-alias')

module.exports = () => {
  moduleAlias.addAlias('react', 'preact/compat')
  moduleAlias.addAlias('react-dom', 'preact/compat')
}
