declare module 'database' {
  export const db: {
    serialize<T>(cb: () => T): T
    run(
      statement: string,
      args: Record<string, any>,
      onComplete: (this: { lastID: string }, error?: Error) => void
    ): void
  }
}

declare module 'db' {
  export default function deleteFromDb(arg: any, ...args: any[]): Promise<void>
}

declare module 'auth' {
  export function validator<TFn extends (...args: any[]) => any>(fn: TFn): TFn
  export function another<TFn extends (...args: any[]) => any>(fn: TFn): TFn
}

declare module 'anything' {
  const ANYTHING: any
  export default ANYTHING
}

declare module 'foo' {
  const f: any
  export default f
  export const f1: any
  export const f2: any
}

declare module 'components' {
  import React from 'react'

  export function Button(
    props: {
      action: () => Promise<any>
    } & React.ComponentProps<'button'>
  ): React.ReactNode

  export function Form(
    props: React.PropsWithChildren<{ action: () => Promise<any> }>
  ): React.ReactNode

  export function Client(props: Record<string, any>): React.ReactNode
}

declare module 'navigation' {
  export function redirect(href: string): void
}

// Some tests generate `data:text/javascript,...` imports
declare module 'data:text/*'
