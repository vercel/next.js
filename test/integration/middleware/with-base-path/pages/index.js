import Link from 'next/link'

export default function Main({ message }) {
  return (
    <div>
      <h1 className="title">Hello {message}</h1>
      <ul>
        <li>
          <Link href="/stream-response">
            <a>Stream a response</a>
          </Link>
        </li>
        <li>
          <Link href="/rewrite-me-to-about?message=refreshed">
            <a id="link-with-rewritten-url" className={message}>
              Rewrite me to about
            </a>
          </Link>
        </li>
        <li>
          <Link href="/rewrite-me-to-vercel">
            <a>Rewrite me to Vercel</a>
          </Link>
        </li>
        <li>
          <Link href="/redirect-me-to-about">
            <a>redirect me to about</a>
          </Link>
        </li>
      </ul>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || 'World' },
})
