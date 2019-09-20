import React from 'react'
import Link from 'next/link'

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps () {
  return {
    props: {
      world: 'world',
      time: new Date().getTime()
    },
    revalidate: false
  }
}

export default ({ world, time }) => {
  return (
    <>
      <p>hello: {world}</p>
      <span>time: {time}</span>
      <Link href='/'>
        <a id='home'>to home</a>
      </Link>
      <br />
      <Link href='/another'>
        <a id='another'>to another</a>
      </Link>
    </>
  )
}
