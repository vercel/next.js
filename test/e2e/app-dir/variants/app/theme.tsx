import { connection } from 'next/server'

import { theme } from '../variants'

// Reading a variant while prerendering is not supported yet, so the read is
// kept at request time. `connection()` defers it, and callers wrap this in a
// `<Suspense>` boundary, which Cache Components requires for a dynamic read.
// Remove both once static generation supports variants.
export async function Theme() {
  await connection()

  return <p id="theme">{await theme()}</p>
}
