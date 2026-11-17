// TypeScript doesn't locate packages with the package map.
declare module 'greeting' {
  const value: string
  export default value
}

declare module 'shared' {
  const value: string
  export default value
}

declare module 'client-lib' {
  const value: string
  export default value
}
