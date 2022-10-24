/// <reference types="node" />

// Extend the NodeJS namespace with Next.js-defined properties
declare namespace NodeJS {
  interface Process {
    /**
     * @deprecated Use `typeof window` instead
     */
    readonly browser: boolean
  }

  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test'
  }

  interface RequestInit extends globalThis.RequestInit {
    next?: NextFetchRequestConfig | undefined
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

interface Window {
  MSInputMethodContext?: unknown
  __NEXT_HMR_CB?: null | ((message?: string) => void)
}

interface NextFetchRequestConfig {
  revalidate?: number
}

interface RequestInit {
  next?: NextFetchRequestConfig | undefined
}
