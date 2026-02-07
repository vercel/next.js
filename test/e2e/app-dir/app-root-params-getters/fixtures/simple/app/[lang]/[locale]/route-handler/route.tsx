import { lang, locale } from 'next/root-params'

export async function GET() {
  return Response.json(
    // TODO(root-params): We're missing some wiring to set `requestStore.rootParams`,
    // so both of these will currently return undefined
    { lang: await lang(), locale: await locale() }
  )
}
