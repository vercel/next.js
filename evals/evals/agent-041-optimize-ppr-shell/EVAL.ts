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
 * The does-Page-block-on-data check is semantic, so it uses the agentic LLM
 * judge rather than regex. The old /getDashboardData\s*\(/ whole-file ban
 * rejected functionally correct streaming — e.g. async section components
 * defined in page.tsx itself, or the documented pattern of starting the
 * fetch in Page without awaiting and passing the promise down — while a
 * byte-identical solution split across two files passed. The judge reasons
 * about whether Page actually blocks before returning, whatever the form.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

const appDir = join(process.cwd(), 'app')

function readFile(name: string): string {
  return readFileSync(join(appDir, name), 'utf-8')
}

test('Page has at least 3 Suspense boundaries', () => {
  const page = readFile('page.tsx')

  const suspenseCount = (page.match(/<Suspense[\s>]/g) || []).length
  expect(suspenseCount).toBeGreaterThanOrEqual(3)
})

test('Each dashboard section has its own Suspense boundary in page.tsx', () => {
  const page = readFile('page.tsx')

  // Split page into Suspense blocks: text between each <Suspense and </Suspense>
  const suspenseBlocks = page.split(/<Suspense[\s>]/).slice(1)

  const components = ['CardStats', 'RevenueChart', 'LatestInvoices']
  for (const component of components) {
    const inOwnBlock = suspenseBlocks.some(
      (block) => block.includes(component) && block.includes('</Suspense>')
    )
    expect(inOwnBlock, `${component} should be inside its own <Suspense>`).toBe(
      true
    )
  }
})

test('Page does not await all data before rendering', async () => {
  await expect(environment).toSatisfyCriterion(
    `The dashboard page must produce a static PPR shell: the default-exported Page component in app/page.tsx returns its JSX frame without blocking on dashboard data, and the data-driven sections stream in under <Suspense> boundaries.

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
