// Copied from "middleware-responses" test
import a from 'next/a'

export default function Home({ message }) {
  return (
    <div>
      <p className="title">Hello {message}</p>
      <a href="/api/stream-a-response">Stream a response</a>
      <div />
      <a href="/api/stream-long">Stream a long response</a>
      <a href="/api/stream-end-stream">Test streaming after response ends</a>
      <div />
      <a href="/api/stream-header-end">
        Attempt to add a header after stream ends
      </a>
      <div />
      <a href="/api/redirect-stream">
        Redirect to Google and attempt to stream after
      </a>
      <div />
      <a href="/api/header">Respond with a header</a>
      <div />
      <a href="/api/header?nested-header=true">
        Respond with 2 headers (nested middleware effect)
      </a>
      <div />
      <a href="/api/body-end-header">Respond with body, end, set a header</a>
      <div />
      <a href="/api/body-end-body">Respond with body, end, send another body</a>
      <div />
      <a href="/api/send-response">Respond with body</a>
      <div />
      <a href="/api/redirect-body">Redirect and then send a body</a>
      <div />
      <a href="/api/react">Send React component as a body</a>
      <div />
      <a href="/api/react-stream">Stream React component</a>
      <div />
      <a href="/api/bad-status">404</a>
      <div />
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || 'World' },
})
