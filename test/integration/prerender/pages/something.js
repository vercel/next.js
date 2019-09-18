import React from 'react'
import Link from 'next/link'

export const config = {
  experimentalPrerender: true,
  experimentalRevalidate: false
}

export async function getStaticProps () {
  return {
    props: {
      time: new Date().getTime()
    }
  }
}

export default ({ time }) => {
  return (
    <>
      <p>time: {time}</p>
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
