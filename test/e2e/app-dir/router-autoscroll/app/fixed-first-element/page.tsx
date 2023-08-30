export default function FixedFirstElementPage() {
  return (
    <>
      <nav style={{ position: 'fixed' }}>Fixed nav bar</nav>
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
