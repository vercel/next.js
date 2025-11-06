it('should handle this in default parameters for function declaration', () => {
  function withDefault(value = this.prop) {
    return value
  }

  const obj = { prop: 42 }
  expect(withDefault.call(obj)).toBe(42)
})

it('should handle this in default parameters for function expression', () => {
  const funcExpr = function (value = this.prop) {
    return value
  }

  const obj = { prop: 55 }
  expect(funcExpr.call(obj)).toBe(55)
})

it('should handle this in default parameters for arrow function', () => {
  const obj = {
    prop: 77,
    test() {
      const arrow = (value = this.prop) => value
      return arrow()
    },
  }
  expect(obj.test()).toBe(77)
})

it('should handle this in default parameters for object method', () => {
  const obj = {
    prop: 100,
    method(value = this.prop) {
      return value
    },
  }
  expect(obj.method()).toBe(100)
})
