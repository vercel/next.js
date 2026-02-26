import { cookies } from 'next/headers'

// This layout does NOT have runtime prefetch and neither does the child
// page. Since no segment has runtime prefetch enabled, sync IO in
// generateMetadata should be allowed.

export async function generateMetadata() {
  await cookies()
  const now = Date.now()
  return {
    title: `Layout metadata with sync IO: ${now}`,
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
