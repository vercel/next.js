import Link from 'next/link'

// Shared by `/server-console` and `/server-console/recur` so a test can patch
// one source file and still reach the error from a second, statically routed
// document. `'disabled'` is never passed at runtime: it is a stable literal
// that the test rewrites to `'recur'` to silence the parent while keeping the
// nested route failing, so avoid "simplifying" this comparison away.
export default function ServerConsole({
  error,
}: {
  error?: 'recur' | 'disabled'
}) {
  if (error !== 'disabled') {
    console.error(new Error('server console failed'))
  }
  return (
    <>
      <p id="content">Before edit</p>
      <Link id="recur" href="/server-console/recur" prefetch={false}>
        Recur
      </Link>
    </>
  )
}
