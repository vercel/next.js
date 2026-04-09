export default function LeafPage() {
  return (
    <div>
      <h2>Leaf Segment Page</h2>
      <p>This is a leaf segment with parallel routes but NO child routes.</p>
      <p>
        No default.tsx files are required for @header, @sidebar, or @metrics
        because there are no child routes to navigate to.
      </p>
    </div>
  )
}
