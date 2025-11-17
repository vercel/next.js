import type { NextConfig } from 'next'
import type { Options } from '@mdx-js/loader'
import type { RuleSetConditionAbsolute } from 'webpack'
import * as React from 'react'

declare module 'mdx/types.js' {
  // This makes the MDX types understand React.
  export import JSX = React.JSX
}

type WithMDX = (config: NextConfig) => NextConfig

declare namespace nextMDX {
  interface NextMDXOptions {
    /**
     * A webpack rule test to match files to treat as MDX.
     *
     * @default /\.mdx$/
     * @example
     * // Support both .md and .mdx files.
     * /\.mdx?$/
     */
    extension?: RuleSetConditionAbsolute

    /**
     * The options to pass to MDX.
     *
     * @see https://mdxjs.com/packages/mdx/#api
     */
    options?: Options & {
      remarkPlugins?:
        | (
            | string
            | [name: string, options: any]
            | NonNullable<Options['remarkPlugins']>[number]
          )[]
        | Options['remarkPlugins']
      rehypePlugins?:
        | (
            | string
            | [name: string, options: any]
            | NonNullable<Options['rehypePlugins']>[number]
          )[]
        | Options['rehypePlugins']
    }
  }
}

/**
 * Use [MDX](https://github.com/mdx-js/mdx) with [Next.js](https://github.com/vercel/next.js)
 */
declare function nextMDX(options?: nextMDX.NextMDXOptions): WithMDX

export = nextMDX
