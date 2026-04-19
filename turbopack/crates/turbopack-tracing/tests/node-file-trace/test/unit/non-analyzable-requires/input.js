// analyzable:
require('./dep')

// non-analyzable:
var s = {
  require,
}
s.require('./ignored.js')
require(escaped)
