import type { Program } from 'estree'
import type * as hast from 'hast'
import type * as mdast from 'mdast'
import type { NextConfig } from 'next'
import type { Options } from '@mdx-js/loader'
import type { Plugin } from 'unified'
import type * as unist from 'unist'
import type { RuleSetConditionAbsolute } from 'webpack'

type WithMDX = (config: NextConfig) => NextConfig

declare namespace nextMDX {
  type Pluggable<Node extends unist.Node> =
    | Plugin<any[], Node>
    | [Plugin<any[], Node>, ...any[]]
    | [string, ...any[]]

  interface MDXOptions
    extends Omit<Options, 'recmaPlugins' | 'rehypePlugins' | 'remarkPlugins'> {
    recmaPlugins: Pluggable<Program>[]
    rehypePlugins: Pluggable<hast.Root>[]
    remarkPlugins: Pluggable<mdast.Root>[]
  }

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
    options?: MDXOptions
  }
}

/**
 * Use [MDX](https://github.com/mdx-js/mdx) with [Next.js](https://github.com/vercel/next.js)
 */
declare function nextMDX(options?: nextMDX.NextMDXOptions): WithMDX

export = nextMDX
