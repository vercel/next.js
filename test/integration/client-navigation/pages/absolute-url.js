import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

export async function getServerSideProps({ query: { port } }) {
  if (!port) {
    throw new Error('port required')
  }
  return { props: { port } }
}

export default function Page({ port }) {
  const router = useRouter()
  return (
    <>
      <Link href="https://vercel.com/">
        <a id="absolute-link">Go</a>
      </Link>
      <button
        id="router-push"
        onClick={() => router.push('https://vercel.com/')}
      >
        Go push
      </button>
      <button
        id="router-replace"
        onClick={() => router.replace('https://vercel.com/')}
      >
        Go replace
      </button>

      <Link href={`http://localhost:${port}/nav/about`}>
        <a id="absolute-local-link">Go</a>
      </Link>
      <Link
        href={`http://localhost:${port}/dynamic/[slug]/route`}
        as={`http://localhost:${port}/dynamic/hello/route`}
      >
        <a id="absolute-local-dynamic-link">Go</a>
      </Link>
      <button
        id="router-local-push"
        onClick={() => router.push(`http://localhost:${port}/nav/about`)}
      >
        Go push
      </button>
      <button
        id="router-local-replace"
        onClick={() => router.replace(`http://localhost:${port}/nav/about`)}
      >
        Go replace
      </button>
    </>
  )
}
