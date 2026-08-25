// Expect: INSTANT — the awaited function is a "use cache" scope in another
// file; its body replays from the resume-data-cache during the final
// prerender, so the await does not block.
import { getRecentArticles } from './data'

export default async function Page() {
  const articles = await getRecentArticles()
  return <ul>{articles.length}</ul>
}
