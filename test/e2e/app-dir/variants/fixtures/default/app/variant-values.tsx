import { connection } from 'next/server'
import { headers } from 'next/headers'

import { locale, theme } from '../variants'

// Reading a variant while prerendering is not supported yet, so the reads are
// kept at request time. `connection()` defers them, and callers wrap this in a
// `<Suspense>` boundary, which Cache Components requires for a dynamic read.
// Remove both once static generation supports variants.
export async function VariantValues() {
  await connection()
  const requestHeaders = await headers()

  return (
    <>
      <p id="theme">{await theme()}</p>
      <p id="locale">{await locale()}</p>
      <p id="internal-variants-header">
        {requestHeaders.has('x-next-internal-variants') ? 'present' : 'absent'}
      </p>
    </>
  )
}
