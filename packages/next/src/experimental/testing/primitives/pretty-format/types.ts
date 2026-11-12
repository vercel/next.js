/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface Colors {
  comment: { close: string; open: string }
  content: { close: string; open: string }
  prop: { close: string; open: string }
  tag: { close: string; open: string }
  value: { close: string; open: string }
}
type Indent = (arg0: string) => string
export type Refs = Array<unknown>
type Print = (arg0: unknown) => string

export type Theme = Required<{
  comment?: string
  content?: string
  prop?: string
  tag?: string
  value?: string
}>

/**
 * compare function used when sorting object keys, `null` can be used to skip over sorting.
 */
export type CompareKeys = ((a: string, b: string) => number) | null | undefined

type RequiredOptions = Required<PrettyFormatOptions>

export interface Options
  extends Omit<RequiredOptions, 'compareKeys' | 'theme'> {
  compareKeys: CompareKeys
  theme: Theme
}

export interface PrettyFormatOptions {
  /**
   * Call `toJSON` on objects before formatting them.
   * Ignored after the formatter has already called `toJSON` once for a value.
   * @default true
   */
  callToJSON?: boolean
  /**
   * Whether to escape special characters in regular expressions.
   * @default false
   */
  escapeRegex?: boolean
  /**
   * Whether to escape special characters in strings.
   * @default true
   */
  escapeString?: boolean
  /**
   * Whether to highlight syntax using terminal colors.
   * @default false
   */
  highlight?: boolean
  /**
   * Number of spaces to use for each level of indentation.
   * @default 2
   */
  indent?: number
  /**
   * Maximum depth to recurse into nested values.
   * @default Infinity
   */
  maxDepth?: number
  /**
   * Maximum number of items to print in arrays, sets, maps, and similar collections.
   * @default Infinity
   */
  maxWidth?: number
  /**
   * Approximate per-depth-level budget for output length.
   * When the accumulated output at any single depth level exceeds this value,
   * further nesting is collapsed. This is a heuristic safety valve, not a hard
   * limit — total output can reach up to roughly `maxDepth × maxOutputLength`.
   * @default 1_000_000
   */
  maxOutputLength?: number
  /**
   * Whether to minimize added whitespace, including indentation and line breaks.
   *
   * When `true`, pretty-format defaults `spacingInner` to `' '`, `spacingOuter` to `''`,
   * and ignores indentation. It also changes the default for `printBasicPrototype`
   * from `true` to `false`, although an explicit `printBasicPrototype` still wins.
   * Explicit `spacingInner` / `spacingOuter` overrides still apply.
   * @default false
   */
  min?: boolean
  /**
   * Whether to print `Object` / `Array` prefixes for plain objects and arrays.
   *
   * Defaults to `true`, unless `min` is `true`, in which case it defaults to `false`.
   * An explicit `printBasicPrototype` value always overrides the `min` default.
   */
  printBasicPrototype?: boolean
  /**
   * Whether to include the function name when formatting functions.
   * @default true
   */
  printFunctionName?: boolean
  /**
   * Whether to include shadow-root contents when formatting DOM nodes.
   * @default true
   */
  printShadowRoot?: boolean
  /**
   * Compare function used when sorting object keys. Set to `null` to disable sorting.
   */
  compareKeys?: CompareKeys
  /**
   * Plugins used to serialize application-specific data types.
   * @default []
   */
  plugins?: Plugins
  /**
   * Whitespace inserted after commas between items or entries.
   *
   * For example, in `{a: 1, b: 2}` or `[1, 2]`, this controls the gap after each comma:
   * `{a: 1,${spacingInner}b: 2}`
   * `[1,${spacingInner}2]`
   *
   * Defaults to `'\n'` in regular mode and `' '` when `min` is `true`.
   * Can be overridden independently of `min`.
   */
  spacingInner?: string
  /**
   * Whitespace inserted immediately inside collection/object delimiters.
   *
   * For example, this controls the space or newline right after the opening delimiter
   * and right before the closing delimiter:
   * `{${spacingOuter}a: 1${spacingOuter}}`
   * `[${spacingOuter}1${spacingOuter}]`
   *
   * Defaults to `'\n'` in regular mode and `''` when `min` is `true`.
   * Can be overridden independently of `min`.
   */
  spacingOuter?: string
  /**
   * Whether to print strings using single quotes instead of double quotes.
   *
   * For example:
   * `"hello"` when `false`
   * `'hello'` when `true`
   *
   * @default false
   */
  singleQuote?: boolean
  /**
   * Whether to always quote object property keys.
   *
   * For example:
   * `{"a": 1}` when `true`
   * `{a: 1}` when `false` and the key is a valid identifier
   * `{"my-key": 1}` still stays quoted because it is not a valid identifier
   *
   * @default true
   */
  quoteKeys?: boolean
}

export type OptionsReceived = PrettyFormatOptions

export interface Config {
  callToJSON: boolean
  compareKeys: CompareKeys
  colors: Colors
  escapeRegex: boolean
  escapeString: boolean
  indent: string
  maxDepth: number
  maxWidth: number
  min: boolean
  plugins: Plugins
  printBasicPrototype: boolean
  printFunctionName: boolean
  printShadowRoot: boolean
  spacingInner: string
  spacingOuter: string
  singleQuote: boolean
  quoteKeys: boolean
  maxOutputLength: number
  /**
   * Per-depth budget accumulator for `maxOutputLength`.
   * @internal
   */
  _outputLengthPerDepth: number[]
}

export type Printer = (
  val: unknown,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  hasCalledToJSON?: boolean
) => string

type Test = (arg0: any) => boolean

export interface NewPlugin {
  serialize: (
    val: any,
    config: Config,
    indentation: string,
    depth: number,
    refs: Refs,
    printer: Printer
  ) => string
  test: Test
}

interface PluginOptions {
  edgeSpacing: string
  min: boolean
  spacing: string
}

export interface OldPlugin {
  print: (
    val: unknown,
    print: Print,
    indent: Indent,
    options: PluginOptions,
    colors: Colors
  ) => string
  test: Test
}

export type Plugin = NewPlugin | OldPlugin

export type Plugins = Array<Plugin>
