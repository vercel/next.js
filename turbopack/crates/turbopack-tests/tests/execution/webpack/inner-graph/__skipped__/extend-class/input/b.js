import A from './a.js'
import { A1 } from './dep1'

export default class B {
  constructor() {}
  test() {
    this.a = new A()
    this.a2 = new A1()
  }
}
