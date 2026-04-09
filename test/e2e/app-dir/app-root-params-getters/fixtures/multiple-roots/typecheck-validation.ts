// This file is NOT a React component — it only exists to validate
// the generated root-params.d.ts types via `tsc --noEmit`.
// Lines marked @ts-expect-error must produce a type error; if they
// don't, tsc itself will fail ("Unused '@ts-expect-error' directive").

import { id } from 'next/root-params'
// @ts-expect-error — nonexistent is not a root param
import { nonexistent as _nonexistent } from 'next/root-params'

async function _validate() {
  // --- id: Promise<string | undefined> (only in dashboard root, not landing) ---
  const _idVal: string | undefined = await id() // ok
  // @ts-expect-error — id() does not return a number
  const _idBad: number = await id()
}
