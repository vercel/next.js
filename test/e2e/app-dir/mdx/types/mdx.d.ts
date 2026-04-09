// types/mdx.d.ts
declare module '*.mdx' {
  import type { JSX } from 'react'
  let MDXComponent: (props) => JSX.Element
  export default MDXComponent
}

declare module '*.md' {
  import type { JSX } from 'react'
  let MDXComponent: (props) => JSX.Element
  export default MDXComponent
}
