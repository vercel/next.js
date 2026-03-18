let names = ['cannot-resolve']
if (globalThis.foo != undefined) {
  // ensure `<dynamic>` is part of the array
  names.push(globalThis.foo)
}

let result
for (let name of names) {
  try {
    result = require(name).Iconv
    return
  } catch {}
}

console.log(result)

it('should correctly handle potentially completely dynamic requests', () => {
  expect(result).toBeUndefined()
})
