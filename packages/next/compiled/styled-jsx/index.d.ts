import React from 'react'

declare module 'react' {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean
    global?: boolean
  }
}

export type StyleRegistry = {
  styles(options?: { nonce?: string }): JSX.Element[]
  flush(): void
  add(props: any): void
  remove(props: any): void
}
export function useStyleRegistry(): StyleRegistry
export function StyleRegistry({
  children,
  registry
}: {
  children: JSX.Element | React.ReactNode
  registry?: StyleRegistry
}): JSX.Element
export function createStyleRegistry(): StyleRegistry
