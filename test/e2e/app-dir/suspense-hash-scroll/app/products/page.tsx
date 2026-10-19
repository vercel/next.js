export default function ProductsPage() {
  return (
    <main style={{ padding: '20px' }}>
      <h1 id="products-page-title">Products (No Suspense)</h1>
      <div style={{ height: '1200px', background: '#f5f5f5' }}>
        <p>Spacer section before categories</p>
      </div>
      <div>
        {Array.from({ length: 60 }, (_, i) => (
          <h2
            key={i}
            id={`category-${i}`}
            style={{ height: '60px', margin: '20px 0' }}
          >
            Category {i}
          </h2>
        ))}
      </div>
    </main>
  )
}
