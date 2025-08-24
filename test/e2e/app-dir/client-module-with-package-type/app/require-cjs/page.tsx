import * as React from 'react'

const CjsFromCjs = require('lib-cjs')

export default function Page() {
  return (
    <p>
      lib-cjs: <CjsFromCjs />
    </p>
  )
}
