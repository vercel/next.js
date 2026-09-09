import { Suspense } from 'react'
import { getArticles } from '../../lib/cms'

async function ArticleList() {
  const articles = await getArticles()
  const published = articles.filter((article) => !article.draft)
  return (
    <ul>
      {published.map((article) => (
        <li key={article.slug}>{article.title}</li>
      ))}
    </ul>
  )
}

export default function ArticlesPage() {
  return (
    <main>
      <h1>Articles</h1>
      <Suspense fallback={<p>Loading articles…</p>}>
        <ArticleList />
      </Suspense>
    </main>
  )
}
