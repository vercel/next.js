import Head from 'next/head'
import Link from 'next/link'

export default () => {
  return (
    <div>
      <Head>
        <script
          dangerouslySetInnerHTML={{
            __html: `Object.defineProperty(navigator, 'userAgent', {
              value: new URLSearchParams(location.search).get("useragent"),
            });`,
          }}
        ></script>
      </Head>
      <br />
      <Link href="/another" id="link-another">
        to /another
      </Link>
    </div>
  )
}
