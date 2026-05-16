import { headers } from 'next/headers'

// Dynamic usage in page, wrapped with Suspense boundary
export default function Page() {
  return (
    <div>
      <h1>Dynamic Page</h1>
      <SubComponent />
    </div>
  )
}

async function SubComponent() {
  await headers()
  return <div>Dynamic Headers</div>
}

export async function generateMetadata() {
  // Slow but static metadata
  await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
  return {
    title: `dynamic page`,
  }
}
