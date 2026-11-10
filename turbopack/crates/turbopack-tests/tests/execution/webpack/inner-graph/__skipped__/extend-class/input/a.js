import B from './b.js'
import { A1 } from './dep1'

export default class A extends B {
  constructor() {
    super()
  }
  test() {
    super.test()

    this.b = new B()
    this.a1 = new A1()
  }
}
