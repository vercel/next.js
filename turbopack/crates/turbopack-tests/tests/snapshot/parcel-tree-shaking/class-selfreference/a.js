class Bar {
  constructor() {
    this.foo = 'bar';
  }

  duplicate() {
    return new Bar();
  }
}

output = new Bar().duplicate();
