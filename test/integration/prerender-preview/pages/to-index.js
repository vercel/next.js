import Link from 'next/link'

export function getStaticProps() {
  return { props: {} }
}

export default function () {
  return (
    <main>
      <Link href="/">
        <a id="to-index">To Index</a>
      </Link>
    </main>
  )
}
