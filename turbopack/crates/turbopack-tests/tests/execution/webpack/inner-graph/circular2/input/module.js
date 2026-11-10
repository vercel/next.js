function x() {
  return [y, z]
}

function y() {
  return [x, z]
}

function z() {
  return [x, y]
}

export { x, y, z }

function a() {
  return [a, b, c, d]
}

function b() {
  return [a, b, c, d]
}

function c() {
  return [a, b, c, d]
}

function d() {
  return [a, b, c, d]
}

export { a }

function f1() {
  return [f2, f4]
}

function f2() {
  return [f1, f3]
}

function f3() {
  return [f2, f4]
}

function f4() {
  return [f1, f3]
}

export { f3 }
