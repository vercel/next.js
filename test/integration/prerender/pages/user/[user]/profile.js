import React from 'react'
import Link from 'next/link'

// eslint-disable-next-line camelcase
export async function unstable_getStaticParams () {
  return []
}

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps ({ params }) {
  return {
    props: {
      user: params.user,
      time: (await import('perf_hooks')).performance.now()
    },
    revalidate: 10
  }
}

export default ({ user, time }) => {
  return (
    <>
      <p>User: {user}</p>
      <span>time: {time}</span>
      <Link href='/'>
        <a id='home'>to home</a>
      </Link>
    </>
  )
}
