export default function ScrollableSegmentPage() {
  return (
    <div
      data-testid="segment-container"
      style={{ height: '50vh', overflow: 'scroll' }}
    >
      <div style={{ height: '60vh' }}>Scroll me</div>
    </div>
  )
}
