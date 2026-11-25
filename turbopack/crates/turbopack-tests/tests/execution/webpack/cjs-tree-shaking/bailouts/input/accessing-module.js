exports.abc = 'abc'

function f(m) {
  m.exports = { abc: 'abc', def: 'def' }
}

f(module)
