import { getData, preload } from '../shared'

const sharedUrl =
  'https://next-data-api-endpoint.vercel.app/api/random?page=static'

async function getCachedData(): Promise<string> {
  'use cache'

  // Joins the outer fetch via the module-scoped dedupe map (see note in
  // ../shared.ts).
  return getData(sharedUrl).then((res) => res.text())
}

async function Cached() {
  // The timeout error must also be shown in the Next.js DevTools when the
  // invocation is wrapped in a try/catch.
  try {
    const data = await getCachedData()

    return <p id="result">{data}</p>
  } catch (error) {
    return <p id="result">Error: {error.message}</p>
  }
}

export default function Page() {
  // Simulate another part of the tree (e.g. a sibling component or a shared
  // data loader) kicking off the same fetch in outer scope before `Cached`
  // runs.
  preload(sharedUrl)

  return <Cached />
}
