import React from 'react'
import Link from 'next/link'

export async function getServerSideProps({ query: { port } }) {
  if (!port) {
    throw new Error('port required')
  }
  return { props: { port } }
}

export default function Page({ port }) {
  return (
    <>
      <Link
        href={`http://localhost:${port}/rewrite-no-basepath`}
        id="absolute-link"
      >
        http://localhost:{port}/rewrite-no-basepath
      </Link>
    </>
  )
}
