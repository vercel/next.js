import Link from 'next/link'

export default function Main({ message }) {
  return (
    <div>
      <h1 className="title">Hello {message}</h1>
      <ul>
        <li>
          <Link href="/stream-response">Stream a response</Link>
        </li>
        <li>
          <Link
            href="/rewrite-me-to-about?message=refreshed"
            id="link-with-rewritten-url"
            className={message}
          >
            Rewrite me to about
          </Link>
        </li>
        <li>
          <Link href="/rewrite-me-to-vercel">Rewrite me to Vercel</Link>
        </li>
        <li>
          <Link href="/redirect-me-to-about">redirect me to about</Link>
        </li>
        <li>
          <Link
            href="/dynamic-routes/hello-world"
            id="go-to-hello-world-anchor"
          >
            Hello World
          </Link>
        </li>
      </ul>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || 'World' },
})
