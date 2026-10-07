// Padded past the compression size threshold. A response too small to compress
// is ended synchronously and cannot reproduce the deferred-end state.
const PADDING = Array.from({ length: 200 }, (_, i) => `padding line ${i}`)

function Error({ statusCode }) {
  return (
    <main>
      <h1>{statusCode}</h1>
      {PADDING.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </main>
  )
}

Error.getInitialProps = ({ res, err }) => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 500,
})

export default Error
