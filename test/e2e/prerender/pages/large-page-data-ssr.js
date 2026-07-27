import React from 'react'
import Link from 'next/link'

export function getServerSideProps() {
  return {
    props: {
      lotsOfData: new Array(256 * 1000).fill('a').join(''),
    },
  }
}

export default (props) => {
  return (
    <>
      <p>lots of data returned</p>
      <Link href="/" id="home">
        to home
      </Link>
      <br />
      <Link href="/another" id="another">
        to another
      </Link>
    </>
  )
}
