// This file is NOT a React component — it only exists to validate
// the generated root-params.d.ts types via `tsc --noEmit`.
// Lines marked @ts-expect-error must produce a type error; if they
// don't, tsc itself will fail ("Unused '@ts-expect-error' directive").

// The (marketing) layout is served at "/" but is a sibling of [locale]/layout,
// not its parent, so both are root layouts.
import { locale } from 'next/root-params'
// @ts-expect-error — nonexistent is not a root param
import { nonexistent as _nonexistent } from 'next/root-params'

async function _validate() {
  // --- locale: Promise<string | undefined> (only in [locale] root, not (marketing)) ---
  const _localeVal: string | undefined = await locale() // ok
  // @ts-expect-error — locale() does not return a number
  const _localeBad: number = await locale()
}
