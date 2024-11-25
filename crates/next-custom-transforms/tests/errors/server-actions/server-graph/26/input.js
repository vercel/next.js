export class MyClass {
  static async foo() {
    return fetch('https://example.com').then((res) => res.json())
  }
  static async bar() {
    'use cache'

    // arguments is not allowed here
    console.log(arguments)
    // this is not allowed here
    return this.foo()
  }
}
