import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('fixes the first-load hierarchy without prescribing an API', async () => {
  await expect(environment).toSatisfyCriterion(`
    Strictly judge the final app's first-load experience. The people/team stats
    and eight-member directory must still load through the original delayed data
    reads; deleting data, functionality, or artificial latency fails.

    The app must not stack a global overlay, route spinner, and local loading
    signal for the same wait. Meaningful content that can remain visible must not
    be needlessly obscured. Before members arrive, the UI must not claim that the
    directory is empty or show another plausible final state derived from missing
    data. If a skeleton is used, it should reserve approximately the final eight
    64px rows and avatar geometry, avoid layout shift, and be decorative to
    assistive technology. A different implementation may pass if it prevents the
    same duplicate-loading, false-state, and layout-shift failures. Do not require
    Suspense, loading.tsx, Server Components, or any particular API.
  `)
})
