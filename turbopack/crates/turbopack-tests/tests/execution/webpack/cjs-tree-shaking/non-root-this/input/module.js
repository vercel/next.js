function F() {
  this.test1 = true
  Object.defineProperty(this, 'test2', { value: true })
}

exports.fff = new F()
