import { cookies } from 'next/headers'

// NOTE: the page must export the following literally, we can't
// reexport them from here:
//
// export const prefetch = 'partial'
// export const instant: Instant = {
//   level: 'experimental-error',
//   unstable_samples: [{ cookies: [] }],
// }

export default async function Page() {
  return (
    <main>
      <p>
        This page has an unguarded session data access. This is not allowed if
        <code>{`ensureStatic >= "shell"`}</code>.
      </p>
      <Cookies />
    </main>
  )
}

async function Cookies() {
  await cookies()
  return <div>Cookies data</div>
}
