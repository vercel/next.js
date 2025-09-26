export class Foo {
  test() {
    return Foo.value
  }
}
Foo.value = 2

export class Bar {
  test() {
    return Bar.value
  }
}
Bar.value = 2
