// This file is NOT a React component — it only exists to validate
// the generated root-params.d.ts types via `tsc --noEmit`.
// Lines marked @ts-expect-error must produce a type error; if they
// don't, tsc itself will fail ("Unused '@ts-expect-error' directive").

import { 'lang-country' as langCountry } from 'next/root-params'
// @ts-expect-error — nonexistent is not a root param
import { nonexistent as _nonexistent } from 'next/root-params'

async function _validate() {
  // --- lang-country: Promise<string | undefined> ---
  const _langCountryVal: string | undefined = await langCountry() // ok
  // @ts-expect-error — langCountry() does not return a number
  const _langCountryBad: number = await langCountry()
}
