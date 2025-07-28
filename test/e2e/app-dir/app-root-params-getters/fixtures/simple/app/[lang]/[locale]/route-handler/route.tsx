import { lang, locale } from 'next/root-params'

export async function GET() {
  return Response.json({ lang: await lang(), locale: await locale() })
}
