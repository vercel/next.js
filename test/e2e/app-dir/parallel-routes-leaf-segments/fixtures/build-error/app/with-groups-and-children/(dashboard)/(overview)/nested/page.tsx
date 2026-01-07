export default function NestedPage() {
  return (
    <div>
      <h3>Nested Child Page</h3>
      <p>
        This child route exists under a path with route groups, making the
        parent a non-leaf segment.
      </p>
      <p>
        ERROR: The @analytics and @metrics slots should have default.tsx files!
      </p>
      <p>
        Even though the parent has route groups, the hasChildRoutesForSegment
        helper correctly filters them out and detects this nested child route.
      </p>
    </div>
  )
}
