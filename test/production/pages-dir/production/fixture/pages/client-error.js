import Link from 'next/link'
import Error from 'next/error'

// prevent static generation for build trace test
export function getServerSideProps() {
  return {
    props: {},
  }
}

export default function Page(props) {
  return (
    <>
      <Error title="something went wrong (on purpose)" />
      <Link href="/">to home</Link>
    </>
  )
}
