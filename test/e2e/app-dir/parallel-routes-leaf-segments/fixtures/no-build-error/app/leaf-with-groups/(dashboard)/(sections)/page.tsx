export default function GroupedLeafPage() {
  return (
    <div>
      <h3>Grouped Leaf Segment Page</h3>
      <p>
        This demonstrates a leaf segment with route groups (dashboard) and
        (sections).
      </p>
      <p>
        Even though the path includes route groups, the logic correctly
        identifies this as a leaf segment because route groups don't contribute
        to routing.
      </p>
      <p>No default.tsx required for @analytics or @reports!</p>
    </div>
  )
}
