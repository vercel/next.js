import React from 'react'
import { useCachedPromise } from '../../components/promise-cache'

export default function Backpressure() {
  const elements = []
  for (let i = 0; i < 2000; i++) {
    elements.push(
      <React.Suspense key={i} fallback={<span>loading...</span>}>
        <Item idx={i} />
      </React.Suspense>
    )
  }
  return <React.Suspense>{elements}</React.Suspense>
}

function Item({ idx }) {
  const key = idx.toString()
  if (typeof window === 'undefined') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useCachedPromise(key, () => Promise.resolve(), true)
  }
  return <span className="item">{key}</span>
}

// Disable offline build
export function getServerSideProps() {
  return { props: {} }
}
