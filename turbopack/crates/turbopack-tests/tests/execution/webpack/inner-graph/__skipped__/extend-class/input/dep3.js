import { mixin1, mixin2, mixin3, getField, A, B, C, Y, mixin4 } from './dep2'

export const A1 = class A1 extends A {
  render() {
    return new E()
  }
}

export const B1 = class B1 extends /*#__PURE__*/ mixin1(B) {
  render() {
    return new E()
  }
}

export const C1 = class C1 extends mixin2(Y, /*#__PURE__*/ mixin3(C)) {
  render() {
    return new D()
  }
}

export class Y1 extends /*#__PURE__*/ mixin2(Y) {
  constructor() {
    super()

    this.innerClass = class B2 extends mixin1(B) {}
  }

  render() {
    return new D()
  }
}

export class Bar extends /*#__PURE__*/ mixin4(A) {
  [/*#__PURE__*/ getField()] = 12
}

export class E {}
const D = class D {}
