// This file is NOT a React component — it only exists to validate
// the generated root-params.d.ts types via `tsc --noEmit`.
// Lines marked @ts-expect-error must produce a type error; if they
// don't, tsc itself will fail ("Unused '@ts-expect-error' directive").

// `lang-country` is not a valid JS identifier, so it cannot be a named import —
// it is accessed through the module namespace instead.
import * as rootParams from 'next/root-params'

async function _validate() {
  // --- lang-country: Promise<string | undefined> ---
  const _langCountryVal: string | undefined = await rootParams['lang-country']() // ok
  // @ts-expect-error — lang-country() does not return a number
  const _langCountryBad: number = await rootParams['lang-country']()

  // @ts-expect-error — nonexistent is not a root param
  rootParams.nonexistent
}
