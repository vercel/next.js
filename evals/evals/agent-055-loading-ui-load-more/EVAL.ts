import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('loads another page without disturbing existing rows', async () => {
  await expect(environment).toSatisfyCriterion(`
    Strictly judge the final paginated member list. The delayed getMembers read,
    Load more control, and all pages of members must still work; deleting latency
    or pagination fails. Clicking Load more must add the next members without
    clearing, replacing, re-keying, or remounting the rows already on screen. The
    existing rows and viewport should remain stable while the next page loads.
    Loading feedback, if needed, belongs to the new page or the Load more control,
    not over the whole list. URL-driven server pages, client-side append, and other
    implementations may pass when they produce this behavior. Do not require
    useTransition, Suspense, router navigation, or a particular API.
  `)
})
