// This file is NOT a React component — it only exists to validate
// the generated root-params.d.ts types via `tsc --noEmit`.
// Lines marked @ts-expect-error must produce a type error; if they
// don't, tsc itself will fail ("Unused '@ts-expect-error' directive").

// `lang-country` (not a valid identifier) and `default` (reserved word)
// cannot be named imports — they are accessed through the module namespace.
import * as rootParams from 'next/root-params'

async function _validate() {
  // --- lang-country: Promise<string | undefined> ---
  const _langCountryVal: string | undefined = await rootParams['lang-country']() // ok
  // @ts-expect-error — lang-country() does not return a number
  const _langCountryBad: number = await rootParams['lang-country']()

  // --- default (reserved word): Promise<string | undefined> ---
  const _defaultVal: string | undefined = await rootParams.default() // ok
  // @ts-expect-error — default() does not return a number
  const _defaultBad: number = await rootParams.default()

  // @ts-expect-error — nonexistent is not a root param
  rootParams.nonexistent
}
