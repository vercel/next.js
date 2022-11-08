import * as React from 'react'

// if (!('hot' in Math)) Math.hot = false

export default function page() {
  // const previous = Math.hot
  // Math.hot = true
  // return <div>{previous ? 'HOT' : 'COLD'}</div>
  return <div>hello</div>
}

export const config = {
  runtime: 'experimental-edge',
}
