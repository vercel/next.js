import { unstable_navigation } from 'next/cache'

// NOTE: the page must export the following literally, we can't
// reexport them from here:
//
// export const prefetch = 'partial'
// export const instant: Instant = {
//   level: 'experimental-error',
//   unstable_samples: [{}],
// }

export default async function Page() {
  return (
    <main>
      <p>
        This page has an unguarded <code>navigation()</code> access. This is not
        allowed in Partial Prefetching, regardless of{' '}
        <code>{`ensureStatic`}</code>, because it blocks the shell.
      </p>
      <Navigation />
    </main>
  )
}

async function Navigation() {
  await unstable_navigation()
  return <div>Navigation data</div>
}
