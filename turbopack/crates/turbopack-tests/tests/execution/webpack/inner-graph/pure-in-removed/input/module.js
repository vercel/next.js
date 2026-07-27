function f() {
  return 43
}

if (true) {
  var x = /*#__PURE__*/ f() - 1
  var y = 42
} else {
  var x = /*#__PURE__*/ f()
  var y = 43
}

export const getX = () => x,
  getY = () => y
