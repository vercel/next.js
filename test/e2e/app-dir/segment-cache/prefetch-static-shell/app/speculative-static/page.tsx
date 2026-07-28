// The Speculative-phase counterpart of app/fully-static/page.tsx: a page
// that accesses no runtime data at all, but opts into RUNTIME prefetching
// (`allow-runtime`). Such a segment requires runtime-completeness in every
// phase, and the Speculative phase only processes it when a link opts in
// (the consuming test uses `prefetch={true}`; non-eager routes are otherwise
// shell-only by design).
//
// Every prerender of this route is clean, so the route tree prefetch always
// carries the static-prefetch hint: the Speculative phase attempts a static
// prefetch of this segment instead of going straight to a runtime one. The
// static responses are always complete (a runtime request would return
// nothing more), so the attempt is sufficient and no runtime request fires
// at all — even though the segment is configured for runtime prefetching.
// (Note this relies on the server emitting static data for allow-runtime
// segments, which it now does unconditionally.)
export const prefetch = 'allow-runtime'

export default function Page() {
  return (
    <main>
      <p id="page-content">Speculative-static page content</p>
    </main>
  )
}
