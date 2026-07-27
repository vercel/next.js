export default function FixedFirstElementPage() {
  return (
    <>
      <nav style={{ position: 'sticky', top: 0 }}>Sticky nav bar</nav>
      <div id="content-that-is-visible" style={{ paddingTop: 40 }}>
        Content which is not hidden.
      </div>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>{i}</div>
        ))
      }
    </>
  )
}
