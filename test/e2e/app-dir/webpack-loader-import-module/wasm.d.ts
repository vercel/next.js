declare module '*.wasm' {
  const add: (a: number, b: number) => number
  export { add }
}
