import { cookies } from 'next/headers'

// Opt out of instant validation so the empty static shell is allowed (rather
// than throwing a static-shell bailout). This reproduces the blank-document
// scenario the fix targets.
export const instant = false

// A page that reads a dynamic value at the root with no Suspense boundary above
// it. During Instant Navigation Testing this produces an empty static shell,
// which previously rendered as a blank document with no DevTools. The server
// now clears the instant-nav cookie and surfaces an error page instead.
export default async function RootBlockingPage() {
  const cookieStore = await cookies()
  const testCookie = cookieStore.get('testCookie')

  return (
    <div data-testid="root-blocking-content">
      testCookie: {testCookie?.value ?? 'not set'}
    </div>
  )
}
