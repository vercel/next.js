import type { ReactNode } from 'react'

// Synchronous pseudo-RNG seeded from a per-render timestamp. Both the
// number and the derived color change on every render, so a frozen color
// visually proves a stored render is being replayed from the cache, while
// a changing color proves the region is re-rendered per request.
// `performance.now()` is prerenderable (unlike dynamic IO), so badges in
// cached shell regions legitimately keep a stable color — the bug is when
// regions that should be per-request are stable too.
function pseudoRandomColor(seed: number): string {
  // Integerize with sub-millisecond precision so consecutive renders get
  // distinct seeds, then scramble (mulberry32-style) so nearby seeds
  // produce visually distant hues.
  let t = Math.floor(seed * 1000) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const n = (t ^ (t >>> 14)) >>> 0
  return `hsl(${n % 360}deg 85% 55%)`
}

// The badge is deliberately a CHILDLESS component: during a resume, React
// only replays the component path that leads to postponed holes, and a
// subtree with no hole below it is never re-executed. Because Badge wraps
// no children it can never be on a hole path, so it runs exactly once per
// genuine render of its region. A frozen color therefore always means
// "this output came from a stored render", and a changing color always
// means "this region was truly re-rendered" — replay can't muddy either
// signal.
function Badge({ name }: { name: string }) {
  const renderedAt = performance.now()
  const color = pseudoRandomColor(renderedAt)

  // The visible color and rendered-at text must reflect the value that was
  // SERVED in the HTML, even though the inlined hydration (flight) payload
  // is regenerated fresh per request and React reconciles the DOM against
  // it after load. Three facts make that possible:
  //
  // 1. Inline scripts execute when the parser inserts them; React patching
  //    a script element's text later does NOT re-execute it. So the paint
  //    command below runs exactly once, with the served value baked in.
  // 2. React never patches attributes or style properties it didn't render:
  //    the script paints via `data-value`, `title`, and the
  //    `--badge-color` custom property — none of which appear in the JSX —
  //    so post-hydration updates leave them alone. The dot's background is
  //    the constant string `var(--badge-color)`, which compares equal on
  //    every update and is never rewritten.
  // 3. The visible number is rendered by CSS (`content: attr(data-value)`),
  //    not as a React-managed text node, so there is no text mismatch for
  //    hydration to "fix".
  //
  // The `if not already set` guard means a freshly inserted script (e.g. a
  // client-side navigation mounting new badge elements) paints its own
  // fresh value, while re-executions against an already-painted badge are
  // no-ops.
  const paint = `{const s=document.currentScript;const el=s&&s.previousElementSibling;if(el&&!el.getAttribute('data-value')){el.setAttribute('data-value',${JSON.stringify(
    renderedAt.toFixed(3)
  )});el.setAttribute('title',${JSON.stringify(
    String(renderedAt)
  )});el.style.setProperty('--badge-color',${JSON.stringify(color)});}}`

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <style>{`[data-badge]::after{content:' rendered-at ' attr(data-value);opacity:0.6;font-weight:normal}`}</style>
      <span data-badge={name} suppressHydrationWarning>
        <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'var(--badge-color)',
            border: '1px solid #0003',
            verticalAlign: 'middle',
          }}
        />
      </span>
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: paint }}
      />
    </span>
  )
}

// A visible wrapper for a layout or page: a border marking the segment's
// extent plus the render-provenance Badge. The wrapper itself renders
// nothing time-dependent — the badge owns the timestamp — so it doesn't
// matter that the wrapper is replayed on resume (it wraps children and is
// therefore always on the hole path). Deliberately uses no element ids so
// it can never collide with the test selectors (#rendered-at, #category,
// ...).
export function Boundary({
  name,
  children,
}: {
  name: string
  children?: ReactNode
}) {
  return (
    <div
      data-boundary={name}
      style={{
        border: '2px solid #94a3b8',
        borderRadius: 8,
        padding: 12,
        margin: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'monospace',
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        <strong>{name}</strong>
        <Badge name={name} />
      </div>
      {children}
    </div>
  )
}
