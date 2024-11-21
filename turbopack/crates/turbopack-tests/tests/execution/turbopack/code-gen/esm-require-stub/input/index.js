import './module.js'

function testRequire(f){
  expect(typeof f).toBe("function")
  expect(() => f("foo")).toThrow("dynamic usage of require is not supported");
}

it('should have a require stub in ESM', () => {
  testRequire(require)
})
