import Link from 'next/link'

export default function Page(props) {
  if (!props.params.slug) {
    return (
      <div>
        <h1>Demo</h1>
        <ul>
          <li>
            <Link href="/home">
              <a>A/B Testing</a>
            </Link>
          </li>
          <li>
            <Link href="/rewrite-me-to-about">
              <a>Rewrite to existing page</a>
            </Link>
          </li>
          <li>
            <Link href="/redirect-me-to-about">
              <a>Redirect to existing page</a>
            </Link>
          </li>
          <li>
            <Link href="/rewrite">
              <a>Rewrite to external site</a>
            </Link>
          </li>
          <li>
            <Link href="/redirect">
              <a>Redirect to external site</a>
            </Link>
          </li>
          <li>
            <Link href="/greetings">
              <a>Respond with JSON</a>
            </Link>
          </li>
          <li>
            <Link href="/stream-response">
              <a>Respond with Stream</a>
            </Link>
          </li>
          <li>
            <Link href="/dynamic/greet?greeting=hola">
              <a>Dynamic Nested Middleware</a>
            </Link>
          </li>
          <li>
            <Link href="/eval">
              <a>do a eval</a>
            </Link>
          </li>
          <li>
            <Link href="/logs">
              <a>print some logs</a>
            </Link>
          </li>
          <li>
            <Link href="/fetch">
              <a>perform a fetch</a>
            </Link>
          </li>
          <li>
            <Link href="/throw-error">
              <a>throw an error</a>
            </Link>
          </li>
          <li>
            <Link href="/throw-error-internal">
              <a>throw a controller error</a>
            </Link>
          </li>
          <li>
            <Link href="/timeout">
              <a>simulate timeout</a>
            </Link>
          </li>
        </ul>
      </div>
    )
  }

  return (
    <>
      <p id="page">[[..slug]]</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticPaths() {
  return {
    paths: ['/somewhere'],
    fallback: 'blocking',
  }
}

export function getStaticProps({ params }) {
  if (params.slug?.[0] === 'somewhere' && params.slug.length === 1) {
    return {
      notFound: true,
    }
  }
  return {
    props: {
      params,
      now: Date.now(),
    },
  }
}
