const rax = require('rax')
const RaxCompat = module.exports = {}

Object.keys(rax).forEach((key) => {
  RaxCompat[key] = rax[key]
})

Object.keys(RaxCompat.PropTypes).forEach((key) => {
  const original = RaxCompat.PropTypes[key]
  RaxCompat.PropTypes[key] = (...args) => {
    original(...args)
    return {
      isRequired () {}
    }
  }
})

RaxCompat.Children = {
  map (children, fn) {
    return Array.from(children).map((i) => fn(i))
  },

  forEach (children, fn) {
    Array.from(children).forEach((i) => fn(i))
  },

  count (children) {
    return Array.from(children).length
  },

  only (children) {
    return Array.from(children)[0]
  },

  toArray (children) {
    return Array.from(children)
  }
}
