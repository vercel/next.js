try {
  var x = NOT_DEFINED
  var y = x
  var ok = false
} catch (e) {
  var yep = true
  var ok = yep
}

try {
  const b = a
  var c = b
  const a = 42
  var ok2 = false
  eval('') // TODO terser has a bug and incorrectly remove this code, eval opts out
} catch (e) {
  var ok2 = true
}

export { x, y, c, ok, ok2 }
