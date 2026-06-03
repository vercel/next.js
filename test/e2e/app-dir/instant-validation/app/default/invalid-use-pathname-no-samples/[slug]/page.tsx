import { PathnameLabel } from './pathname-label'

// No `unstable_instant` config at all — the [slug] param becomes a fallback
// route param during validation, which means usePathname() suspends. This is
// the natural user shape and matches the test-app's repro at
// `88-client-use-pathname/[slug]/page.tsx`.

export default function Page() {
  return (
    <main>
      <PathnameLabel />
    </main>
  )
}
