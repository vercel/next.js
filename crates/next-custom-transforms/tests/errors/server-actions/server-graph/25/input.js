export class MyClass {
  async foo() {
    'use cache'

    return fetch('https://example.com').then((res) => res.json())
  }
  async bar() {
    'use server'

    console.log(42)
  }
}
