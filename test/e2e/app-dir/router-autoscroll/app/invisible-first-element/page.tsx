export default function InvisibleFirstElementPage() {
  return (
    <>
      <div style={{ display: 'none' }}>Content that is hidden.</div>
      <div id="content-that-is-visible">Content which is not hidden.</div>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>{i}</div>
        ))
      }
    </>
  )
}
