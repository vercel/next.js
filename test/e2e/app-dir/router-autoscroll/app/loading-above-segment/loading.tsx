export default function Loading() {
  return <LongLoading id="loading-above-segment-fallback" />
}

export function LongLoading({ id }: { id: string }) {
  return (
    <>
      <div id={id}>Loading component</div>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>Loading {i}...</div>
        ))
      }
    </>
  )
}
