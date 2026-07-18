import { cookies } from 'next/headers'

// Throw site: the runtime data access. The instant-validation error's code
// frame correctly points here — but wrapping THIS component in <Suspense>
// does not fix it. The boundary has to go around the mount site (see
// app-sidebar.tsx), one frame up.
export async function DynamicBreadcrumb() {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value ?? 'system'
  return <nav>Theme: {theme}</nav>
}
