import { connection } from 'next/server'

import { locale, theme } from '../variants'

// Reading a variant while prerendering is not supported yet, so the reads are
// kept at request time. `connection()` defers them, and callers wrap this in a
// `<Suspense>` boundary, which Cache Components requires for a dynamic read.
// Remove both once static generation supports variants.
export async function VariantValues() {
  await connection()

  return (
    <>
      <p id="theme">{await theme()}</p>
      <p id="locale">{await locale()}</p>
    </>
  )
}
