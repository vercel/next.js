class A {
  other: B | null
  constructor() {
    this.other = null
  }
}

class B {
  a: A
  constructor(a: A) {
    this.a = a
    a.other = this
  }
}

const objA = new A()
const objB = new B(objA)

export default function Page() {
  // eslint-disable-next-line no-throw-literal
  throw { objA, objB }
}
