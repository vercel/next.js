import { headers } from 'next/headers'
import { lang, locale } from 'next/root-params'

export default async function Page({ params }) {
  await headers()
  const { slug } = await params
  return (
    <div>
      <p id="dynamic-params">{slug}</p>
      <p id="root-params">
        {JSON.stringify({ lang: await lang(), locale: await locale() })}
      </p>
    </div>
  )
}
