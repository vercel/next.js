async function getCachedData(): Promise<string> {
  'use cache'

  // A cache fill that never completes, exceeding the configured
  // `useCacheTimeout`, so the fill times out.
  await new Promise<void>(() => {})

  return 'data'
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
  return <Cached />
}
