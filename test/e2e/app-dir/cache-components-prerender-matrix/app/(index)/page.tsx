// Demo index for the cache-components route matrix. Every layout and page
// renders a Boundary: a border marking the segment plus a color badge
// derived from performance.now() at render time.
//
// How to read the badges when reloading a URL:
// - colors CHANGE on every reload  -> the region is re-rendered (resumed)
//   per request.
// - colors STAY THE SAME           -> the region is served from a cached
//   render. Whether that is correct depends on the matrix: params that
//   generateStaticParams can complete MAY be prerendered; params it never
//   provides must NOT be.
//
// Every page links to its variants along all dimensions (lang, category,
// shell topology, branch, matrix), so any starting point can reach the
// whole matrix.
export default function Page() {
  return (
    <main style={{ fontFamily: 'monospace', lineHeight: 1.8, padding: 16 }}>
      <h1>cache components route matrix</h1>
      <p>
        Reload each page a few times and watch the color badges. Changing color
        = re-rendered per request. Frozen color = served from a cached render.
      </p>

      <h2>partial-static-param — lang and category enumerated, id never</h2>
      <ul>
        <li>
          <a href="/partial-static-param/with-root-param/empty-shell/fr/toys/123">
            with-root-param/empty-shell/fr/toys/123
          </a>{' '}
          — BUG (all modes): non-enumerated root param, ALL badges freeze
        </li>
        <li>
          <a href="/partial-static-param/without-root-param/empty-shell/en/toys/123">
            without-root-param/empty-shell/en/toys/123
          </a>{' '}
          — correct self-hosted (all badges cycle); BUG on Vercel (freezes once
          HIT)
        </li>
        <li>
          <a href="/partial-static-param/without-root-param/non-empty-shell/en/toys/123">
            without-root-param/non-empty-shell/en/toys/123
          </a>{' '}
          — shell badges stable, [id] region cycles (the healthy split)
        </li>
      </ul>

      <h2>fully-static-param — a complete instance (en/shoes/1) enumerated</h2>
      <ul>
        <li>
          <a href="/fully-static-param/without-root-param/empty-shell/en/shoes/1">
            without-root-param/empty-shell/en/shoes/1
          </a>{' '}
          — fully prerendered at build: ALL badges frozen is CORRECT here
        </li>
        <li>
          <a href="/fully-static-param/without-root-param/empty-shell/en/shoes/2">
            without-root-param/empty-shell/en/shoes/2
          </a>{' '}
          — id is prerenderable: completes to a per-URL prerender on demand
          (classic blocking ISR), frozen after first load is CORRECT
        </li>
      </ul>

      <h2>dynamic-param — no generateStaticParams at all</h2>
      <ul>
        <li>
          <a href="/dynamic-param/without-root-param/empty-shell/anything/at/all">
            without-root-param/empty-shell/anything/at/all
          </a>{' '}
          — nothing prerenderable: one shared entry for every URL, all badges
          cycle on every load
        </li>
        <li>
          <a href="/dynamic-param/without-root-param/non-empty-shell/anything/at/all">
            without-root-param/non-empty-shell/anything/at/all
          </a>{' '}
          — shared generic shell (stable shell badges for every URL), params
          always resumed
        </li>
      </ul>
    </main>
  )
}
