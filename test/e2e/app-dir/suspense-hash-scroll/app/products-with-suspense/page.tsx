import { Suspense } from 'react'

async function AsyncCategories() {
  // Simulate network delay to trigger Suspense boundary
  await new Promise((resolve) => setTimeout(resolve, 300))

  return (
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
  )
}

export default function ProductsWithSuspensePage() {
  return (
    <main style={{ padding: '20px' }}>
      <h1>Products (With Suspense)</h1>
      <div style={{ height: '1200px', background: '#f5f5f5' }}>
        <p>Spacer section before categories</p>
      </div>
      <Suspense
        fallback={
          <div id="suspense-fallback" style={{ height: '600px' }}>
            <p>Loading categories...</p>
          </div>
        }
      >
        <AsyncCategories />
      </Suspense>
    </main>
  )
}
