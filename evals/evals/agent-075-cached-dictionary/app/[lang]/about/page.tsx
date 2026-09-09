import { getDictionary } from '@/lib/dictionary'

export default async function AboutPage() {
  const dict = await getDictionary()
  return (
    <main>
      <h1>{dict.about.heading}</h1>
      <p>{dict.about.body}</p>
      <footer data-testid="dict-stamp">{dict.loadedAt}</footer>
    </main>
  )
}
