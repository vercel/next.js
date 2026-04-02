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

export function ProductDetailSkeleton() {
  return (
    <div className="product-detail">
      <div className="product-hero skeleton-image" />
      <div className="product-info">
        <div className="skeleton-text large" />
        <div className="skeleton-text short" />
        <div className="skeleton-text" />
      </div>
    </div>
  )
}
