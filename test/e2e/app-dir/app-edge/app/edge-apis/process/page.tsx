import React from 'react'

export default function Page() {
  return (
    <>
      <p id="process">
        {typeof process === 'object'
          ? typeof process.emit === 'function'
            ? 'emit'
            : 'object'
          : 'undefined'}
      </p>
    </>
  )
}

export const runtime = 'edge'
