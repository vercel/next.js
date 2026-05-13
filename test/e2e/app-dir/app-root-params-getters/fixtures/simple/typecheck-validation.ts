// This file is NOT a React component — it only exists to validate
// the generated root-params.d.ts types via `tsc --noEmit`.
// Lines marked @ts-expect-error must produce a type error; if they
// don't, tsc itself will fail ("Unused '@ts-expect-error' directive").

import { lang, locale, path } from 'next/root-params'
// @ts-expect-error — nonexistent is not a root param
import { nonexistent as _nonexistent } from 'next/root-params'

async function _validate() {
  // --- lang: Promise<string | undefined> ---
  const _langVal: string | undefined = await lang() // ok
  // @ts-expect-error — lang() does not return a number
  const _langBad: number = await lang()

  // --- locale: Promise<string | undefined> ---
  const _localeVal: string | undefined = await locale() // ok
  // @ts-expect-error — locale() does not return a number
  const _localeBad: number = await locale()

  // --- path: Promise<string[] | undefined> ---
  const _pathVal: string[] | undefined = await path() // ok
  // @ts-expect-error — path() does not return a plain string
  const _pathBad: string = await path()
}
