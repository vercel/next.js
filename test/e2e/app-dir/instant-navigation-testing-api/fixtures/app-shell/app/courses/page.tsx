/**
 * The standard App Shell example (see the Runtime Prefetching guide): the
 * destination mixes four kinds of content.
 *
 * - a static heading                        -> part of the App Shell
 * - <FeaturedCourses>, 'use cache'          -> part of the App Shell
 * - <EnrolledBadge>, reads a session cookie -> part of the App Shell: the
 *                                              route reads cookies, so the
 *                                              shell is the session-
 *                                              personalized variant
 * - <SortLabel>, reads searchParams         -> per-link data, omitted from
 *                                              the App Shell
 * - <LiveEnrollment>, uncached per request  -> only streams in after
 *                                              navigation
 *
 * The App Shell is the route's rendered output minus per-link data. A runtime
 * prefetch (`prefetch = 'allow-runtime'` + `<Link prefetch={true}>`)
 * additionally resolves the link's searchParams.
 */
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const prefetch = 'allow-runtime'

type SearchParams = { [key: string]: string | string[] | undefined }

export default function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <>
      <h1 data-testid="courses-heading">Courses</h1>
      <Suspense
        fallback={<p data-testid="badge-fallback">Checking enrollment...</p>}
      >
        <EnrolledBadge />
      </Suspense>
      <FeaturedCourses />
      <Suspense fallback={<p data-testid="sort-fallback">Sorting...</p>}>
        <SortLabel searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={<p data-testid="live-fallback">Loading live count...</p>}
      >
        <LiveEnrollment />
      </Suspense>
    </>
  )
}

// Reads the session cookie. The route therefore produces a session-
// personalized App Shell variant, cached per session on the client rather
// than shared across users — the badge is part of that shell.
async function EnrolledBadge() {
  const enrolled = (await cookies()).get('enrolled')?.value
  return (
    <p data-testid="enrolled-badge">
      {enrolled ? `Enrolled: ${enrolled}` : 'Not enrolled'}
    </p>
  )
}

// Cached, request-independent: part of the App Shell.
async function FeaturedCourses() {
  'use cache'
  const featured = ['Next.js from First Principles', 'React for Two']
  return (
    <ul data-testid="featured-courses">
      {featured.map((title) => (
        <li key={title}>{title}</li>
      ))}
    </ul>
  )
}

// Reads the link's searchParams. Per-link request data: resolved by a runtime
// prefetch, omitted from the App Shell by definition.
async function SortLabel({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { sort } = await searchParams
  return <p data-testid="sort-label">Sorted by: {sort}</p>
}

// Uncached, must be fresh on every request: no prerender can include it, so
// it only streams in after the navigation commits.
async function LiveEnrollment() {
  await connection()
  return <p data-testid="live-enrollment">1,234 students enrolled right now</p>
}
