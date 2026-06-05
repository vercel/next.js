// ⛔ MESSY: top-level `await cookies()` in a layout gates the whole /dashboard
// subtree out of the shell. The theme is the same regardless of when it resolves,
// so the read should not block the frame. (Fix: lever 1, layout variant — start
// the cookie read without awaiting, pass the promise into a <Suspense> child;
// render {children} unconditionally so the dashboard frame stays in the shell.)
import { cookies } from 'next/headers'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value ?? 'light'

  return (
    <section data-theme={theme}>
      <h2>Dashboard</h2>
      {children}
    </section>
  )
}
