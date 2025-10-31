import type { NextConfig } from 'next'
import type { Options } from '@mdx-js/loader'
import type { RuleSetConditionAbsolute } from 'webpack'

type WithMDX = (config: NextConfig) => NextConfig

type PluggableListName = 'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins'

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
    options?: {
      [Key in keyof Options]: Key extends PluggableListName
        ?
            | (
                | string
                | [name: string, ...options: any[]]
                | NonNullable<Options[Key]>[number]
              )[]
            | Options[Key]
        : Options[Key]
    }
  }
}

/**
 * Use [MDX](https://github.com/mdx-js/mdx) with [Next.js](https://github.com/vercel/next.js)
 */
declare function nextMDX(options?: nextMDX.NextMDXOptions): WithMDX

export = nextMDX
