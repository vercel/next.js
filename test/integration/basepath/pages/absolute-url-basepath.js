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
      <Link href={`http://localhost:${port}/docs/something-else`}>
        <a id="absolute-link">http://localhost:{port}/docs/something-else</a>
      </Link>
    </>
  )
}
