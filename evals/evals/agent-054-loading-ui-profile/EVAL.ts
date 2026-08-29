import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('coordinates profile loading without prescribing boundaries', async () => {
  await expect(environment).toSatisfyCriterion(`
    Strictly judge the final member profile. Bio, activity, related people, and
    missing-member behavior must still work through their original delayed reads;
    deleting sections or latency fails. The three regions must not each display an
    independent generic spinner and pop into the page in response order, pushing
    visible content around. Their reveal should be intentionally coordinated and
    visually stable. Stable labels must not disappear and reappear because they are
    duplicated in loading and final UI. A shared reveal, nested sequence,
    coordinated promises, accurate placeholders, or another implementation may
    pass if it prevents the same popcorn-loading and layout-jump failures. Do not
    require Suspense, Server Components, Promise.all, or a particular API.
  `)
})
