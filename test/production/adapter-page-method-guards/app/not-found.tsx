import { headers } from 'next/headers'

// Reading request headers makes the not-found page dynamic, so it is rendered
// by the `/_not-found` entrypoint on demand instead of a static 404.html.
export default async function NotFound() {
  await headers()
  return <h1>custom not found page</h1>
}
