import Link from 'next/link'
// Leave below import, testing that importing "next"
// doesn't stall the build
// eslint-disable-next-line no-unused-vars
import next from 'next'

// prevent static generation for build trace test
export function getServerSideProps() {
  return {
    props: {},
  }
}

export default function Page() {
  return (
    <div>
      <Link href="/about">About Page</Link>
      <p className="index-page">Hello World</p>
    </div>
  )
}
