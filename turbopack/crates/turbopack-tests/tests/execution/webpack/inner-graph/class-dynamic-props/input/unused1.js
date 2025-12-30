import { a, b, c, d, e, f, A, B, C, D, E, F, X } from './module'

class Unused {
  [a()]() {
    return A
  }
  [b] = B
  get [c]() {
    return C
  }
  static [d()]() {
    return D
  }
  static [e] = E
  static get [f]() {
    return F
  }
}

class Unused2 extends X {
  [a()]() {
    return A
  }
  [b] = B
  get [c]() {
    return C
  }
  static [d()]() {
    return D
  }
  static [e] = E
  static get [f]() {
    return F
  }
}

export {}
