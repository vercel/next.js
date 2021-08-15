import React from 'react'
import { useCachedPromise } from '../../components/promise-cache'

export default function Streaming() {
  return (
    <span id="content">
      <React.Suspense fallback="Loading...">
        <Content />
      </React.Suspense>
    </span>
  )
}

function Content() {
  return useCachedPromise(
    'content',
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve('Hello World'), 5000)
      }),
    true
  )
}

// HACK: Prevent this page from being statically optimized
export function getServerSideProps(ctx) {
  return {
    props: {},
  }
}
