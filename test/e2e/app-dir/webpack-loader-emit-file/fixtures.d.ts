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
declare module '*.copy' {
  export const template: string
}
declare module '*.auto' {
  export const unused: number
}
declare module '*.mapped' {
  const value: string
  export default value
}
declare module '*.postcss' {
  const value: string
  export default value
}
declare module '*.emit-json' {
  const value: { value: string }
  export default value
}
declare module '*.emit-text' {
  const value: string
  export default value
}
declare module '*.emit-raw' {
  const value: string
  export default value
}
declare module '*.emit-bytes' {
  const value: Uint8Array
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
declare module '*.minify' {
  const value: string
  export default value
}
