export default function ChildPage() {
  return (
    <div>
      <h2>Child Page</h2>
      <p>
        This child route exists, which means the parent segment is NOT a leaf.
      </p>
      <p>
        ERROR: The @header and @sidebar slots should have default.tsx files!
      </p>
    </div>
  )
}
