// Fallbacks for the dynamic holes and for `loading.js`: what the static
// shell shows where content is not prerendered.

export function MemberOfferSkeleton() {
  return (
    <aside className="member-offer" aria-busy="true">
      <p>Checking your member price…</p>
    </aside>
  )
}

export function StockSkeleton() {
  return (
    <p className="stock-live" aria-busy="true">
      Checking stock…
    </p>
  )
}

export function SortSkeleton() {
  return (
    <nav className="sort" aria-label="Sort products" aria-busy="true">
      <ul>
        <li>featured</li>
        <li>price-asc</li>
        <li>price-desc</li>
        <li>rating</li>
      </ul>
    </nav>
  )
}

export function PageSkeleton({ label, lines = 6 }) {
  const rows = []
  for (let i = 0; i < lines; i++) rows.push(i)
  return (
    <div className="page-skeleton" aria-busy="true">
      <h1>{label}</h1>
      {rows.map((i) => (
        <p key={i} className="skeleton-line">
          Loading…
        </p>
      ))}
    </div>
  )
}
