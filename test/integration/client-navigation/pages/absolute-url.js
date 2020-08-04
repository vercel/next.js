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
        <a id="absolute-link">https://vercel.com/</a>
      </Link>
      <br />
      <button
        id="router-push"
        onClick={() => router.push('https://vercel.com/')}
      >
        push https://vercel.com/
      </button>
      <br />
      <button
        id="router-replace"
        onClick={() => router.replace('https://vercel.com/')}
      >
        replace https://vercel.com/
      </button>
      <br />
      <Link href={`http://localhost:${port}/nav/about`}>
        <a id="absolute-local-link">http://localhost:{port}/nav/about</a>
      </Link>
      <br />
      <Link
        href={`http://localhost:${port}/dynamic/[slug]/route`}
        as={`http://localhost:${port}/dynamic/hello/route`}
      >
        <a id="absolute-local-dynamic-link">
          http://localhost:{port}/dynamic/hello/route
        </a>
      </Link>
      <br />
      <button
        id="router-local-push"
        onClick={() => router.push(`http://localhost:${port}/nav/about`)}
      >
        push http://localhost:{port}/nav/about
      </button>
      <br />
      <button
        id="router-local-replace"
        onClick={() => router.replace(`http://localhost:${port}/nav/about`)}
      >
        replace http://localhost:{port}/nav/about
      </button>
      <br />
      <Link href="mailto:idk@idk.com">
        <a id="mailto-link">mailto:idk@idk.com</a>
      </Link>
    </>
  )
}
