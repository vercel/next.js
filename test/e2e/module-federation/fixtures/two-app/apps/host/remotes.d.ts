declare module 'remoteApp/Button' {
  import type * as React from 'react'

  export const reactInstance: typeof React

  const Button: React.ComponentType<{ initialCount: number }>
  export default Button
}

declare module 'remoteApp' {
  export const rootMarker: string
}

declare module 'webpackRemote/Greeting' {
  export default function greeting(): string
}
