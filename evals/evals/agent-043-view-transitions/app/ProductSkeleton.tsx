export function ProductGridSkeleton() {
  return (
    <div className="product-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="product-card">
          <div className="product-image skeleton-image" />
          <div className="skeleton-text" />
          <div className="skeleton-text short" />
        </div>
      ))}
    </div>
  )
}
