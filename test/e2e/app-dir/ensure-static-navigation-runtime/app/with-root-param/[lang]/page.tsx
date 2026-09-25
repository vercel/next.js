import { lang } from 'next/root-params'

export const unstable_ensureStatic = 'navigation'

export default async function Page() {
  const currentLang = await lang()
  await cachedDelay(currentLang)
  return (
    <main>
      <p id="lang">{`Lang: ${currentLang}`}</p>
    </main>
  )
}

async function cachedDelay(key: string) {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 500))
  return key
}
