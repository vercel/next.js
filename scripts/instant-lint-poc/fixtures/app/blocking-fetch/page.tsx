// Expect: BLOCKING — uncached fetch awaited in the page body, above any
// Suspense boundary. All three remedies apply.
export default async function Page() {
  const res = await fetch('https://api.example.com/articles')
  const articles = await res.json()
  return <ul>{articles.length}</ul>
}
