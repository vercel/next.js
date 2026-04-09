import { A, B, C } from './inner'

function x(type) {
  switch (type) {
    case 'a':
      return withA('b')
    case 'b':
      return withB('c')
    case 'c':
      return 'ok'
  }
}

function y(v) {
  return withA(v)
}

function withA(v) {
  const value = x(v)

  return A(value)
}

function withB(v) {
  const value = x(v)

  return B(value)
}

function withC(v) {
  const value = x(v)

  return C(value)
}

export { x, y }
