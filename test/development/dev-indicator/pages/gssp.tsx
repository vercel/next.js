import Link from 'next/link'

export default function Page() {
  return (
    <p>
      hello world <Link href="/pregenerated">to /pregenerated</Link>{' '}
      <Link href="/">to /</Link>
    </p>
  )
}

export async function getServerSideProps() {
  return {
    props: {
      static: false,
    },
  }
}
