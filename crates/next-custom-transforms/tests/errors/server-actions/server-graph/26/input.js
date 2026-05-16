import { BaseClass } from './base'

export class MyClass extends BaseClass {
  static async foo() {
    // super is allowed here
    super.foo()

    return fetch('https://example.com').then((res) => res.json())
  }
  static async bar() {
    'use cache'

    if (Math.random() > 0.5) {
      // super is not allowed here
      return [super.bar()]
    }

    // arguments is not allowed here
    console.log(arguments)
    // this is not allowed here
    return this.foo()
  }
}
