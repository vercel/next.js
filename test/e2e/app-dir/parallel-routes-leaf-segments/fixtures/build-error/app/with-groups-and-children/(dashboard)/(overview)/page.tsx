import Link from 'next/link'

export default function GroupedParentPage() {
  return (
    <div>
      <h3>Parent with Route Groups</h3>
      <p>
        This segment has route groups (dashboard) and (overview), but it's NOT a
        leaf because child routes exist.
      </p>
      <nav>
        <Link href="/with-groups-and-children/nested">Go to Nested</Link>
      </nav>
    </div>
  )
}
