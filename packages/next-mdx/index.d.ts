/* eslint-disable */
import { NextConfig } from 'next'
import { CompileOptions } from '@mdx-js/mdx'
import { RuleSetConditionAbsolute } from 'webpack'

type WithMDX = (config: NextConfig) => NextConfig

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
  options?: CompileOptions
}

/**
 * Use [MDX](https://github.com/mdx-js/mdx) with [Next.js](https://github.com/vercel/next.js)
 */
declare function nextMDX(options?: NextMDXOptions): WithMDX

export = nextMDX
/* eslint=enable */
