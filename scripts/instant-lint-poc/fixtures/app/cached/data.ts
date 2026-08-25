export async function getRecentArticles(): Promise<string[]> {
  'use cache'
  const res = await fetch('https://api.example.com/articles')
  return res.json()
}
