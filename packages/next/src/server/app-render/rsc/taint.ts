/*

Files in the rsc directory are meant to be packaged as part of the RSC graph using next-app-loader.

*/

import * as React from 'react'

export const taintObjectReference = process.env.__NEXT_EXPERIMENTAL_REACT
  ? // @ts-ignore
    React.experimental_taintObjectReference
  : null
export const taintUniqueValue = process.env.__NEXT_EXPERIMENTAL_REACT
  ? // @ts-ignore
    React.experimental_taintUniqueValue
  : null
