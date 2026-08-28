import { getDictionary } from '@/lib/dictionary'

export async function Greeting() {
  const dict = await getDictionary()
  return <h1>{dict.greeting}</h1>
}
