import { connection } from 'next/server'

import { locale, theme } from '../variants'

// `connection()` holds both reads at request time. A prerender cannot yet
// supply a variant value, so a read during one has nothing to return.
//
// A variant is runtime data, and Cache Components requires a Suspense boundary
// above a read of one. Every caller of this component provides that boundary.
export async function VariantValues() {
  await connection()

  return (
    <>
      <p id="theme">{await theme()}</p>
      <p id="locale">{await locale()}</p>
    </>
  )
}
