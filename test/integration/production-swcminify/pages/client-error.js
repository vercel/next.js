import Link from 'next/link'
import Error from 'next/error'

export default function Page(props) {
  return (
    <>
      <Error title="something went wrong (on purpose)" />
      <Link href="/">to home</Link>
    </>
  )
}
