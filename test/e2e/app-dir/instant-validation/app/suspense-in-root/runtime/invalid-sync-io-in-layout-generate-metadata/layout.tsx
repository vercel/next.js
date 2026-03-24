import { cookies } from 'next/headers'

// This layout does NOT have runtime prefetch itself, but the child page
// does. Since metadata belongs to the Page, the sync IO heuristic for
// generateMetadata uses the Page's prefetchability. Because the child
// page has runtime prefetch enabled, sync IO in this layout's
// generateMetadata should error.

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
