import Link from 'next/link'

export default function Home({ message }) {
  return (
    <div>
      <p className="title">Hello {message}</p>
      <Link href="/stream-a-response">
        <a>Stream a response</a>
      </Link>
      <div />
      <Link href="/stream-long">
        <a>Stream a long response</a>
      </Link>
      <Link href="/stream-end-stream">
        <a>Test streaming after response ends</a>
      </Link>
      <div />
      <Link href="/stream-header-end">
        <a>Attempt to add a header after stream ends</a>
      </Link>
      <div />
      <Link href="/redirect-stream">
        <a>Redirect to Google and attempt to stream after</a>
      </Link>
      <div />
      <Link href="/header">
        <a>Respond with a header</a>
      </Link>
      <div />
      <Link href="/header?nested-header=true">
        <a>Respond with 2 headers (nested middleware effect)</a>
      </Link>
      <div />
      <Link href="/body-end-header">
        <a>Respond with body, end, set a header</a>
      </Link>
      <div />
      <Link href="/body-end-body">
        <a>Respond with body, end, send another body</a>
      </Link>
      <div />
      <Link href="/send-response">
        <a>Respond with body</a>
      </Link>
      <div />
      <Link href="/redirect-body">
        <a>Redirect and then send a body</a>
      </Link>
      <div />
      <Link href="/react">
        <a>Send React component as a body</a>
      </Link>
      <div />
      <Link href="/react-stream">
        <a>Stream React component</a>
      </Link>
      <div />
      <Link href="/bad-status">
        <a>404</a>
      </Link>
      <div />
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || 'World' },
})
