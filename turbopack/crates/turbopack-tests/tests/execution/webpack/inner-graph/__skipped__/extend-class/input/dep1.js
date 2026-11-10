import { A, B, Z, W } from './dep2'

export const A1 = class A1 extends A {
  render() {
    return new E()
  }
}

class B1 extends B {
  render() {
    return new D()
  }
}

export class Z1 extends Z {}

export class E {}
class D {
  foo() {
    class B2 extends B {}

    return B2
  }
}

export const isZ = new Z1() instanceof Z
export { W }
