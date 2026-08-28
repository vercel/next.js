import { Greeting } from '@/components/Greeting'
import { getDictionary } from '@/lib/dictionary'

export default async function HomePage() {
  const dict = await getDictionary()
  return (
    <main>
      <Greeting />
      <p>{dict.tagline}</p>
      <footer data-testid="dict-stamp">{dict.loadedAt}</footer>
    </main>
  )
}
