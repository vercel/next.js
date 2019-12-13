import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps({ params }) {
  return {
    props: {
      world: 'world',
      params: params || {},
      time: new Date().getTime(),
    },
    revalidate: false,
  }
}

export default ({ world, time, params }) => {
  return (
    <>
      <p>hello: {world}</p>
      <span>time: {time}</span>
      <div id="params">{JSON.stringify(params)}</div>
      <div id="query">{JSON.stringify(useRouter().query)}</div>
      <Link href="/">
        <a id="home">to home</a>
      </Link>
      <br />
      <Link href="/another">
        <a id="another">to another</a>
      </Link>
    </>
  )
}
