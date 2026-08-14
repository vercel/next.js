'use strict'

function greet(name) {
  return 'hi ' + name
}
const value = 42

// Shorthand properties — the shape most compiled CommonJS uses.
module.exports = { greet, value }
