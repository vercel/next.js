const b = 'b-value'

function makeD() {
  return 'd-value'
}

module.exports = {
  a: 'a-value',
  b,
  c: 'c-value',
  d: makeD(),
  greet() {
    return 'hello'
  },
}
