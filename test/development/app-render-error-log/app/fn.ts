function fn2() {
  throw new Error('boom')
}

export function fn1() {
  fn2()
}
