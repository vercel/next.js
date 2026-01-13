import Link from 'next/link'
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <h1 id="page-title-home">Home page</h1>
      <p>
        <Link href="/abc" prefetch={false}>
          go to ABC page
        </Link>
      </p>
      <Script id="next-script-home" />
    </>
  )
}
