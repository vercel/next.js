import React from 'react'
import { useCachedPromise } from './promise-cache'

export default function Styled({ name }) {
  useCachedPromise(
    name,
    () => new Promise((resolve) => setTimeout(resolve, 1000)),
    true
  )

  return (
    <div>
      <p>This is Red.</p>
      <style jsx>{`
        p {
          color: red;
        }
      `}</style>
    </div>
  )
}
