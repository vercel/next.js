'use client'

import v from 'conditional-exports'
import v1 from 'conditional-exports/subpath'

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
