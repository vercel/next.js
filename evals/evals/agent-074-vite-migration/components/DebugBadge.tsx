// TODO(port): blocked — the badge used Vite compile-time env metadata.
//
// The old badge (vite-src/src/DebugBadge.tsx) read the build mode and
// server-vs-browser from the bundler at compile time. Next.js does not have
// that facility. process.env.NODE_ENV could stand in for the mode, but
// nothing in process.env can say whether this particular instance executed
// during server rendering or in the browser, so the honest options are a
// rewrite (context? a prop drilled from the server?) or dropping the badge.
// Stubbed so the build stays green.

export default function DebugBadge() {
  return <span className="debug-badge">env=unknown mode=unknown</span>
}
