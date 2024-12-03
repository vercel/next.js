export default async function Page() {
  // Render a large string such that a prefetch of this segment is roughly 1MB
  // over the network
  return <div id="memory-pressure-step-page">{'a'.repeat(1024 * 1024)}</div>
}

export async function generateStaticParams() {
  // Generate some number of steps. This should be just enough to trigger the
  // default LRU limit used by the client prefetch cache.
  // TODO: Once we add a config option to set the prefetch limit, we can set a
  // smaller number, to speed up testing iteration (and CI).
  const result = []
  for (let i = 0; i < 60; i++) {
    result.push({ step: i.toString() })
  }
  return result
}
