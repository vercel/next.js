import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="page">index</p>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/blog/first">
        <a id="to-blog-first">/blog/first</a>
      </Link>
      <br />
      <Link href="/blog/second">
        <a id="to-blog-second">/blog/second</a>
      </Link>
      <br />
    </>
  )
}

export function getStaticProps() {
  console.log('revalidating /')
  return {
    props: {
      now: Date.now(),
    },
    revalidate: 1,
  }
}
