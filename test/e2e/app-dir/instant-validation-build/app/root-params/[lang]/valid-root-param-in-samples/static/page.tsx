import { Instant } from 'next'
import { lang } from 'next/root-params'
import assert from 'node:assert/strict'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [{ params: { lang: 'en' } }],
}

export default async function Page() {
  // Note that both `generateStaticParams` and `samples` set lang to "en".
  const currentLang = await lang()
  assert.equal(currentLang, 'en', `Unexpected \`lang()\``)
  return (
    <main>
      <p>
        This page uses a root param. It should get it from samples. Root param
        values are known statically, so this is fully statically prefetchable.
      </p>
    </main>
  )
}
