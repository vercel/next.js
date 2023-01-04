class MyClass<T> {
  value: T
  constructor(value: T) {
    this.value = value
  }
}

const instance = new MyClass<string>('Hello World from Generic')

export default instance.value
