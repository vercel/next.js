export default function Loading() {
  return (
    <>
      <div id="loading-component">Loading component</div>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>Loading {i}...</div>
        ))
      }
    </>
  )
}
