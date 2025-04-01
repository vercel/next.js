import Link from 'next/link'

export default function Page() {
  return (
    <p>
      hello world <Link href="/">to /</Link>
    </p>
  )
}

Page.getInitialProps = async () => {
  return {
    static: false,
  }
}
