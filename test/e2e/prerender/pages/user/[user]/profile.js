import React from 'react'
import Link from 'next/link'

export async function getStaticPaths() {
  return { paths: [], fallback: true }
}

export async function getStaticProps({ params }) {
  return {
    props: {
      user: params.user,
      time: (await import('perf_hooks')).performance.now(),
    },
    revalidate: 10,
  }
}

export default ({ user, time }) => {
  return (
    <>
      <p>User: {user}</p>
      <span>time: {time}</span>
      <Link href="/" id="home">
        to home
      </Link>
    </>
  )
}
