import React from 'react'
import Link from 'next/link'

// eslint-disable-next-line camelcase
export async function unstable_getServerProps() {
  return {
    props: {
      slugs: ['post-1', 'post-2'],
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default ({ slugs, time }) => {
  return (
    <>
      <p>Posts: {JSON.stringify(slugs)}</p>
      <span>time: {time}</span>
      <Link href="/">
        <a id="home">to home</a>
      </Link>
    </>
  )
}
