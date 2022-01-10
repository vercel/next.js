if (global.process) {
  module.exports = global.process
} else {
  module.exports = require('../../compiled/process')
}
