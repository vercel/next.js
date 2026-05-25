export default async function Page() {
  // Sync IO during prerender — classified as a Blocking Route Issue,
  // not an Insight.
  const now = Date.now()
  return <p>Now: {now}</p>
}
