/** Include project titles in selected prefetches while deferring details. */

import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('includes selected project titles in their prefetches', async () => {
  await expect(environment).toSatisfyCriterion(
    `Partial Prefetching must be enabled globally or for the /projects/[slug] route. The dashboard Links that navigate to project pages must explicitly opt into per-link prefetching with prefetch={true} or the equivalent bare prefetch prop.

The selected project's cached title must be available from that per-link prefetch and render before the project details. Keep the params-dependent title inside a meaningful Suspense boundary so the reusable App Shell can show a fallback while the selected prefetch resolves it. Fail an unrelated prefetched Link, disabling prefetch, changing the default for unrelated navigation, leaving the title behind navigation(), fetching every project's details during prefetch, or moving the whole page into the reusable shell. Accept equivalent component and file organization.`
  )
})

test('waits until navigation for project details', async () => {
  await expect(environment).toSatisfyCriterion(
    `Project description, activity, deployments, and other detail content must stay outside the prefetch. Render the details through an async component inside a nested Suspense boundary. That component must await navigation() from next/cache before calling the existing cached project-details function or rendering its result.

The navigation() call must stay outside every use cache scope. Fail solutions that load project details before navigation(), replace navigation() with connection() or an uncached fetch, remove the details cache, or prefetch the entire page. Accept equivalent component and file organization.`
  )
})
