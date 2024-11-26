'use client'

class C {
  other: D | null
  constructor() {
    this.other = null
  }
}

class D {
  a: C
  constructor(a: C) {
    this.a = a
    a.other = this
  }
}

const objC = new C()
const objD = new D(objC)

export default function Page() {
  // eslint-disable-next-line no-throw-literal
  throw { objC, objD }
}
