'use client'

import v from 'conditional-exports-optout'
import v1 from 'conditional-exports-optout/subpath'

export default function Client() {
  return (
    <>
      {`Client: ${v}`}
      <br />
      {`Client subpath: ${v1}`}
      <br />
    </>
  )
}
