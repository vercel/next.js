// The Speculative-phase counterpart of app/fully-static/page.tsx: a page
// that accesses no runtime data at all, on a Partial Prefetching route.
// Partial Prefetching segments require runtime-completeness in every phase,
// and the Speculative phase only processes this segment when a link opts in
// (the consuming test uses `prefetch={true}`; non-eager routes are otherwise
// shell-only by design).
//
// Every prerender of this route is clean, so the route tree prefetch always
// carries the static-prefetch hint: the Speculative phase attempts a static
// prefetch of this segment instead of going straight to a runtime one. The
// static responses are always complete (a runtime request would return
// nothing more), so the attempt is sufficient and no runtime request fires
// at all. (Note this relies on the server emitting static data for Partial
// Prefetching segments, which it does unconditionally.)
export const prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <p id="page-content">Speculative-static page content</p>
    </main>
  )
}
