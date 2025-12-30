/// <reference types="node" />

// Extend the NodeJS namespace with Next.js-defined properties
declare namespace NodeJS {
  // only for rust, see https://github.com/napi-rs/napi-rs/issues/1630
  interface TTY {
    setBlocking(blocking: boolean): void
  }

  interface WriteStream {
    _handle?: TTY
  }

  interface Process {
    /**
     * @deprecated Use `typeof window` instead
     */
    readonly browser: boolean
  }

  interface ProcessEnv {
    // TODO: Should be optional and possibly undefined
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

// We implement the behavior of `import 'server-only'` and `import 'client-only'` on the compiler level
// and thus don't require having them installed as dependencies.
// By default it works fine with typescript, because (surprisingly) TSC *doesn't check side-effecting imports*.
// But this behavior can be overridden with `noUncheckedSideEffectImports`
// (https://www.typescriptlang.org/tsconfig/#noUncheckedSideEffectImports)
// which'd cause `import 'server-only'` to start erroring.
// To prevent that, we add declarations for them here.

declare module 'server-only' {
  /**
   * `import 'server-only'` marks your module as only usable on the server
   * and prevents it from being used on the client.
   * Read more: https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning
   */
}

declare module 'client-only' {
  /**
   * `import 'client-only'` marks your module as only usable on the client
   * and prevents it from being used on the server.
   * Read more: https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning
   */
}

interface Window {
  MSInputMethodContext?: unknown
  /** @internal */
  __NEXT_HMR_CB?: null | ((message?: string) => void)
  /** @internal */
  __next_root_layout_missing_tags?: ('html' | 'body')[]
  /** @internal */
  __NEXT_DEV_INDICATOR_POSITION?:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
}

interface NextFetchRequestConfig {
  revalidate?: number | false
  tags?: string[]
}

interface RequestInit {
  next?: NextFetchRequestConfig | undefined
}

declare var _N_E_STYLE_LOAD: (href: string) => Promise<void>
