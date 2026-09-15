function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
// Top-level await makes this an async module, which is what drags the whole
// import cycle into async-module handling.
await sleep(0)

export function asyncFn() {}
