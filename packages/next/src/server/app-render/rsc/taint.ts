/*

Files in the rsc directory are meant to be packaged as part of the RSC graph using next-app-loader.

*/

import * as React from 'react'

type Reference = object
type TaintableUniqueValue = string | bigint | ArrayBufferView

function notImplemented() {
  throw new Error('Taint can only be used with the taint flag.')
}

export const taintObjectReference: (
  message: string | undefined,
  object: Reference
) => void = process.env.__NEXT_EXPERIMENTAL_REACT
  ? // @ts-ignore
    React.experimental_taintObjectReference
  : notImplemented
export const taintUniqueValue: (
  message: string | undefined,
  lifetime: Reference,
  value: TaintableUniqueValue
) => void = process.env.__NEXT_EXPERIMENTAL_REACT
  ? // @ts-ignore
    React.experimental_taintUniqueValue
  : notImplemented
