'use client'

// `'use client'` so the `<link rel="stylesheet" precedence>` JSX is
// rendered on the client during navigation, NOT walked by the Flight
// server. Why this matters:
//
// Flight's dispatcher S slot (`preinitStyle`) is invoked when Flight
// encounters a stylesheet hoistable in the SERVER tree. The S handler
// inserts a `<link rel="stylesheet">` element AND sets
// `state.loading |= 4` before the client's `getResource` runs, which
// short-circuits `preloadResourceAndSuspendIfNeeded` to no throw.
// Putting the `<link>` inside a client component bypasses Flight (which
// only emits a Module reference for client components) — by the time
// `getResource` runs on the client, no resource exists yet, only the
// preload `<link>` and the `preloadPropsMap` entry from the L call on
// `/`.
//
// Multiple stylesheets here mimic front's shape — production routes
// emit many CSS chunks. Each one independently exhibits the bug.
export default function LogsPage() {
  return (
    <>
      <link rel="stylesheet" href="/test-style-a.css" precedence="default" />
      <link rel="stylesheet" href="/test-style-b.css" precedence="default" />
      <link rel="stylesheet" href="/test-style-c.css" precedence="default" />
      <main id="content">
        <h1 id="heading">/logs page</h1>
        <p id="body">Body content for the /logs page.</p>
      </main>
    </>
  )
}
