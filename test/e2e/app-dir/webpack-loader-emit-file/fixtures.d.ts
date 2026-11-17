declare module '*.emit' {
  const url: string
  export default url
}
declare module '*.pitch' {
  const url: string
  export default url
}
declare module '*.file' {
  const url: string
  export default url
}
declare module '*.pure' {
  export const value: string
}
declare module '*.auto' {
  export const unused: number
}
declare module '*.mapped' {
  const value: string
  export default value
}
declare module '*.emit-json' {
  const value: { value: string }
  export default value
}
declare module '*.emit-asset' {
  const value: string
  export default value
}
declare module '*.importer' {
  const value: string
  export default value
}
