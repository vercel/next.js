import Link from 'next/link'

export default function Home({ message }) {
  return (
    <div>
      <p className="title">Hello {message}</p>
      <Link href="/stream-a-response">Stream a response</Link>
      <div />
      <Link href="/stream-long">Stream a long response</Link>
      <Link href="/stream-end-stream">Test streaming after response ends</Link>
      <div />
      <Link href="/stream-header-end">
        Attempt to add a header after stream ends
      </Link>
      <div />
      <Link href="/redirect-stream">
        Redirect to Google and attempt to stream after
      </Link>
      <div />
      <Link href="/header">Respond with a header</Link>
      <div />
      <Link href="/header?nested-header=true">
        Respond with 2 headers (nested middleware effect)
      </Link>
      <div />
      <Link href="/body-end-header">Respond with body, end, set a header</Link>
      <div />
      <Link href="/body-end-body">
        Respond with body, end, send another body
      </Link>
      <div />
      <Link href="/send-response">Respond with body</Link>
      <div />
      <Link href="/redirect-body">Redirect and then send a body</Link>
      <div />
      <Link href="/react">Send React component as a body</Link>
      <div />
      <Link href="/react-stream">Stream React component</Link>
      <div />
      <Link href="/bad-status">404</Link>
      <div />
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || 'World' },
})
