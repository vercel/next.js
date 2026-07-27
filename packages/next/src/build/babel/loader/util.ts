import type { TransformOptions } from 'next/dist/compiled/babel/core'

export function consumeIterator(iter: Iterator<any>) {
  while (true) {
    const { value, done } = iter.next()
    if (done) {
      return value
    }
  }
}

/**
 * Source map standard format as to revision 3.
 *
 * `TransformOptions` uses this type, but doesn't export it separately
 */
export type SourceMap = NonNullable<TransformOptions['inputSourceMap']>

/**
 * An extension of the normal babel configuration, with extra `babel-loader`-specific fields that transforms can read.
 *
 * See: https://github.com/babel/babel-loader/blob/main/src/injectCaller.js
 */
export type BabelLoaderTransformOptions = TransformOptions & {
  target?: string
}
