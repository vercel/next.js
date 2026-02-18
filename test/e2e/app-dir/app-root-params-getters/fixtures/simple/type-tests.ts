// This file is type-checked by typecheck.test.ts after building the fixture.
// It verifies that the generated next/root-params types are correct.
import { lang, locale, path } from 'next/root-params'

// lang and locale are simple dynamic segments → Promise<string>
const langResult: Promise<string> = lang()
const localeResult: Promise<string> = locale()

// path appears in both catch-all and optional-catch-all layouts →
// most permissive type wins: Promise<string[] | undefined>
const pathResult: Promise<string[] | undefined> = path()

export { langResult, localeResult, pathResult }
