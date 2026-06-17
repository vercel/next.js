declare global {
  var something: number
}

export function foo() {
  return global.something
}
