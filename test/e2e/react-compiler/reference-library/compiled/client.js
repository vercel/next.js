'use client'

import { c as _c } from 'react/compiler-runtime'
import { jsx as _jsx } from 'react/jsx-runtime'
export function Container(t0) {
  const $ = _c(2)
  const { children } = t0
  let t1
  if ($[0] !== children) {
    t1 = /*#__PURE__*/ _jsx('p', {
      children: children,
    })
    $[0] = children
    $[1] = t1
  } else {
    t1 = $[1]
  }
  return t1
}
