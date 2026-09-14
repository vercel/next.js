/**
 * Optimize PPR Shell
 *
 * Tests whether the agent decomposes a monolithic loading.tsx (which creates
 * a single implicit Suspense boundary around the entire page) into granular
 * Suspense boundaries — one per dashboard section — so each section can
 * stream independently and the PPR shell contains more static content.
 *
 * Tricky because the starting code uses Next.js's loading.tsx convention,
 * which is an implicit Suspense boundary. Agents need to recognize that
 * loading.tsx creates an all-or-nothing loading state, and that optimizing
 * the PPR shell requires replacing it with per-section Suspense boundaries
 * so each section can stream independently.
 *
 * This eval is judged semantically end to end. It previously also grepped
 * app/page.tsx for >=3 literal <Suspense> tags and for each section sitting in
 * its own block in that file. Those two assertions contradicted the judge: a
 * model that co-locates each boundary inside the section component builds
 * fine, yields a correctly partially prerendered route, and was passed by the
 * judge, yet failed the greps purely because the tags were not typed in
 * page.tsx. They vetoed the judge they were meant to be replaced by, so they
 * are gone; the granularity requirement they encoded now lives in the
 * criterion below.
 *
 * The does-Page-block-on-data check is semantic, so it uses the agentic LLM
 * judge rather than regex. The old /getDashboardData\s*\(/ whole-file ban
 * rejected functionally correct streaming — e.g. async section components
 * defined in page.tsx itself, or the documented pattern of starting the
 * fetch in Page without awaiting and passing the promise down — while a
 * byte-identical solution split across two files passed. The judge reasons
 * about whether Page actually blocks before returning, whatever the form.
 */

import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('Page does not await all data before rendering', async () => {
  await expect(environment).toSatisfyCriterion(
    `The dashboard page must produce a static PPR shell: the default-exported Page component in app/page.tsx returns its JSX frame without blocking on dashboard data, and the data-driven sections suspend independently of one another rather than collapsing into a single all-or-nothing loading state. Judge where the boundaries sit in the rendered tree, not how many there are or which file the <Suspense> tag is written in. Docs for the exact Next.js version installed here ship at node_modules/next/dist/docs — see 01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md and 01-app/03-api-reference/03-file-conventions/loading.md.

For reference, one correct solution keeps Page synchronous and moves each await into a Suspense-wrapped child:

  export default function Page() {
    return (
      <main>
        <h1>Dashboard</h1>
        <Suspense fallback={<CardStatsSkeleton />}>
          <CardStatsSection />
        </Suspense>
        {/* ...RevenueChart and LatestInvoices sections likewise... */}
      </main>
    )
  }

  async function CardStatsSection() {
    const data = await getDashboardData()
    return <CardStats totalRevenue={data.totalRevenue} totalInvoices={data.totalInvoices} />
  }

Equivalent forms are also correct, judge runtime behavior rather than style: the section components may live in this same file or be imported from another file; Page may start the fetch without awaiting it and pass the promise to children that unwrap it; the fetch may be deduplicated with React's cache().

Incorrect: the Page component itself blocks on the data before returning JSX — e.g. it awaits the fetch (or unwraps it with use()) in its own body — or the sections do not actually suspend independently, which collapses the shell back to the original all-or-nothing loading state.`
  )
})
