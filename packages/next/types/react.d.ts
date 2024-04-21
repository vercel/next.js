import React from 'next/dist/compiled/react'

declare module 'react' {
  export function unstable_postpone(reason: string): never
}

export = React
