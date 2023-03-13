import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page(props) {
  if (useRouter().isFallback) {
    return <p>Loading...</p>
  }

  return (
    <>
      <p id="props">{JSON.stringify(props)}</p>
      <Link
        href="/fallback-true-blog/first?hello=world"
        shallow
        id="to-query-shallow"
      >
        to /fallback-true-blog/first?hello=world
      </Link>
      <br />
      <Link href="/fallback-true-blog/second" shallow id="to-no-query-shallow">
        to /fallback-true-blog/second
      </Link>
      <br />
    </>
  )
}

export function getStaticPaths() {
  return {
    paths: [
      '/fallback-true-blog/first',
      '/fallback-true-blog/build-time-1',
      '/fallback-true-blog/build-time-2',
      '/fallback-true-blog/build-time-3',
      '/fallback-true-blog/build-time-4',
    ],
    fallback: true,
  }
}

export function getStaticProps({ params }) {
  return {
    props: {
      params,
      time: Date.now(),
    },
  }
}
