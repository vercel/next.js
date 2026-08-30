import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test.concurrent('makes the first load stable and honest', async () => {
  await expect(environment).toSatisfyCriterion(`
    The final app must preserve the delayed stats and eight-member directory.
    First load should present one understandable loading hierarchy, retain stable
    shell content, and never present missing data as a plausible empty result.
    Any placeholder should reserve approximately the final row/avatar and one-line
    stats geometry. The independent stats read must not unnecessarily hold back
    the directory. Accept any implementation that prevents these failures; do not
    require a particular React or Next.js API. Inspect source and rendered HTML as
    well as browser snapshots because generic ul/li content may be absent from an
    accessibility snapshot.
  `)
})

test.concurrent('keeps search results useful and current', async () => {
  await expect(environment).toSatisfyCriterion(`
    The delayed member search must still work. While a replacement search is
    pending, useful existing results should remain visible instead of being
    replaced by a spinner or believable empty state. Rapid input must not allow an
    older response to overwrite results for the current query, and fast work
    should not cause a distracting spinner flash. Accept any implementation that
    achieves those outcomes; do not require transitions, deferred values, request
    cancellation, or any other specific API.
  `)
})

test.concurrent(
  'ends a failed activity request with a useful error',
  async () => {
    await expect(environment).toSatisfyCriterion(`
    Grace Hopper's activity read must remain a delayed rejection. Once it rejects,
    the profile must show a clear activity-specific error instead of remaining in
    a loading state or blanking the route. Stable profile content, including the
    member's bio, must remain visible. Accept a local error state, an error boundary,
    or any other implementation that achieves those outcomes; do not require a
    particular React or Next.js API.
  `)
  }
)

test.concurrent('coordinates related profile content', async () => {
  await expect(environment).toSatisfyCriterion(`
    Member profiles must preserve the delayed bio, activity, and related-people
    reads, as well as the missing-member behavior. A profile should reveal those
    related sections as a deliberate composition rather than a popcorn sequence
    of competing generic spinners, without unnecessarily hiding content that can
    already remain stable. Accept shared or nested fallbacks, coordinated data,
    or another implementation that achieves the user-visible result; do not
    require a particular boundary structure or data-fetching API.
  `)
})
