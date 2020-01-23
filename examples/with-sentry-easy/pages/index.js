import Link from 'next/link'

const Home = () => (
  <div className="container">
    <style jsx>{`
      .container {
        max-width: 800px;
        margin: 20px auto;
        background: #fff;
        padding: 20px 40px;
      }
      a {
        display: block;
      }
    `}</style>
    <h2>Next-Sentry-Ease</h2>
    <h3>No Error Normal Page</h3>
    <div className="link-container">
      <Link href="/normal">
        <a>Normal Page</a>
      </Link>
    </div>
    <h3>Client Error</h3>
    <div className="link-container">
      <Link href="/client/test1">
        <a>Client Error 1 - initialProps Error</a>
      </Link>
      <Link href="/client/test2">
        <a>Client Error 2 - initialProps Promise Error</a>
      </Link>
      <Link href="/client/test3">
        <a>Client Error 3 - initialProps Async Error</a>
      </Link>
      <Link href="/client/test4">
        <a>Client Error 4 - didMount Error</a>
      </Link>
      <Link href="/client/test5">
        <a>Client Error 5 - render Error</a>
      </Link>
      <Link href="/client/test6">
        <a>Client Error 6 - client Fetch Error</a>
      </Link>
    </div>
    <h3>Server Error</h3>
    <div className="link-container">
      <a target="_blank" href="/server/test1">
        Server Error 1 - initialProps Error
      </a>
      <a target="_blank" href="/server/test2">
        Server Error 2 - initialProps Promise Error
      </a>
      <a target="_blank" href="/server/test3">
        Server Error 3 - initialProps Async Error
      </a>
      <a target="_blank" href="/server/test4">
        Server Error 4 - server Fetch Error
      </a>
    </div>
  </div>
)
export default Home
