import { Instant } from 'next'
import { cookies } from 'next/headers'
import { lang } from 'next/root-params'
import assert from 'node:assert/strict'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [{ params: { lang: 'en-from-samples' } }],
}

export default async function Page() {
  // Guard behind cookies() so that the rest of this component only runs during validation
  await cookies()

  // We'll only get here during validation, so we should only observe the `lang` from `samples`
  const currentLang = await lang()
  assert.equal(currentLang, 'en-from-samples', `Unexpected \`lang()\``)

  return (
    <main>
      <p>
        This page uses a root param. It should get it from samples, not
        generateStaticParams.
      </p>
    </main>
  )
}
