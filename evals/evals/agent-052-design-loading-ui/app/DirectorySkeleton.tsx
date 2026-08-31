export function DirectorySkeleton() {
  return (
    <ul className="member-list">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="member-row-short">
          <span className="skeleton-bar" />
          <span className="skeleton-bar skeleton-bar-narrow" />
        </li>
      ))}
    </ul>
  )
}
