// A page that accesses no runtime data at all: no cookies, headers,
// searchParams, params, or `connection()`. Every prerender of this route is
// clean, so its route tree prefetch always carries the static-prefetch hint,
// and the static per-segment responses are always complete (a runtime
// request would return nothing more).
//
// Note the Shell phase is always permitted to issue a runtime shell request,
// so the absence of one in the test is attributable to the static shell
// attempt succeeding, not to configuration forbidding runtime requests.

export default function Page() {
  return (
    <main>
      <p id="page-content">Fully static page content</p>
    </main>
  )
}
