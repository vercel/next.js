import { lang } from 'next/root-params'

export const ensureStatic = 'navigation'

export default async function Page() {
  const currentLang = await lang()
  return (
    <main>
      <p>{`Lang: ${currentLang}`}</p>
    </main>
  )
}
