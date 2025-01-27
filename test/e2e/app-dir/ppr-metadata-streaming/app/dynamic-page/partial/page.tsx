import { cookies } from 'next/headers'

// Dynamic usage in page, wrapped with Suspense boundary
export default function Page() {
  return (
    <div>
      <h1>Partial Dynamic Page</h1>
      <SubComponent />
    </div>
  )
}

async function SubComponent() {
  const cookieStore = await cookies()
  const cookie = await cookieStore.get('test')
  return <div>Cookie: {cookie?.value}</div>
}

export async function generateMetadata() {
  // Slow but static metadata
  await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
  return {
    title: 'dynamic-page - partial',
  }
}
