export class Foo {
  test() {
    return Foo.value
  }
}
Foo.value = 1

export class Bar {
  test() {
    return Bar.value
  }
}
Bar.value = 1
