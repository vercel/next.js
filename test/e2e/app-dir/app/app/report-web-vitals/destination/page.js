export default function component() {
  return (
    <>
      <h1 id="destination">Destination</h1>
      {/* Some content to paint, so that the client-side navigation to this page
          can be detected as a soft navigation by the browser. */}
      <p>{'Lorem ipsum dolor sit amet. '.repeat(100)}</p>
    </>
  )
}
