export class MyClass {
  static async foo() {
    'use cache'

    return fetch('https://example.com').then((res) => res.json())
  }
  static async bar() {
    'use server'

    console.log(42)
  }
}
