import Head from 'next/head'
import Link from 'next/link'

export default function Home({ now }) {
  return (
    <div>
      <Head>
        <title>next-boost with express.js</title>
      </Head>

      <main
        style={{
          margin: '10em auto',
          maxWidth: '30em',
          lineHeight: 1.5,
        }}
      >
        <div>
          The time from server below will be cached for at least 3 seconds in{' '}
          <strong>production</strong> with <strong>next-boost</strong>.
          <br />
          And it will always be refreshed in dev mode.
        </div>
        <h2>
          <strong>{now}</strong>
        </h2>
        <p>
          <Link href="/hello">/hello</Link> is an express.js route.
        </p>
      </main>
    </div>
  )
}

export const getServerSideProps = async () => {
  return { props: { now: new Date().toISOString() } }
}
