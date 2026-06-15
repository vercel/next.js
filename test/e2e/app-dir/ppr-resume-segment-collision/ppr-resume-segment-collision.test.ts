import { nextTestSetup } from 'e2e-utils'

// Regression: a PPR shell and its resume must not reuse Fizz segment-completion
// ids. React's getPostponedState snapshots `nextSegmentId` before the prelude
// flush; the flush then outlines large completed boundaries into the shell,
// allocating further ids. The resume is seeded from the stale snapshot and
// re-allocates the same ids, so the served document has duplicate
// `<template id="B:n">` / `<div hidden id="S:n">` pairs — and the inline `$RC`
// swap scripts (getElementById, first match) then cross-wire boundary content.
describe('ppr-resume-segment-collision', () => {
  const { next, isNextDev, skipped } = nextTestSetup({ files: __dirname })

  if (skipped || isNextDev) {
    // Dev has no prerendered shell, so the resume path under test never runs.
    it('skips in dev', () => {})
    return
  }

  it('serves the page without duplicate Suspense completion ids', async () => {
    const html = await (await next.fetch('/')).text()

    const dupes = (re: RegExp) => {
      const ids = [...html.matchAll(re)].map((m) => m[1])
      return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))].sort()
    }

    expect({
      segments: dupes(/<div hidden id="(S:[^"]+)"/g),
      templates: dupes(/<template id="(B:[^"]+)"/g),
    }).toEqual({ segments: [], templates: [] })
  })
})
