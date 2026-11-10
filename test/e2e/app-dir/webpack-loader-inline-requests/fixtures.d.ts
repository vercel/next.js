interface Window {
  inlineLoaderScript: string
  inlineLoaderExposed: string
}

declare module '*.requestgen' {
  const value: { dynamic(): Promise<unknown>; [key: string]: unknown }
  export default value
}
declare module '*.string-style' {
  const value: string
  export default value
}
declare module '*.isomorphic-style' {
  const value: { _getCss(): string; _insertCss(): () => void }
  export default value
}
declare module '*.hot-style' {
  const value: string
  export default value
}
declare module '*.web-component-style'
declare module '*.browser-style'
declare module '*.global-script'
declare module '*.exposed'
declare module '*.universal-style'
declare module 'react-web-component-style-loader/exports' {
  export const styleElements: HTMLStyleElement[]
}
