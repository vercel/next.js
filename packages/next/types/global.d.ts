/// <reference types="node" />

// Extend the NodeJS namespace with Next.js-defined properties
declare namespace NodeJS {
  interface Process {
    readonly browser: boolean
  }

  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test'
  }
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.module.sass' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module 'styled-jsx/css' {
  import m from 'next/dist/compiled/styled-jsx/css'
  export = m
}

declare module 'styled-jsx' {
  export * from 'next/dist/compiled/styled-jsx'
}

interface Window {
  MSInputMethodContext?: unknown
}
