import React from 'react'
import Link from 'next/link'

// eslint-disable-next-line camelcase
export async function unstable_getServerProps({ query }) {
  return {
    props: {
      user: query.user,
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default ({ user, time }) => {
  return (
    <>
      <p>User: {user}</p>
      <span>time: {time}</span>
      <Link href="/">
        <a id="home">to home</a>
      </Link>
    </>
  )
}
