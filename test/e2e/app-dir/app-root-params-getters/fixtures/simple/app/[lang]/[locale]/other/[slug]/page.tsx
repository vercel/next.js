import { cookies } from 'next/headers'
import { lang, locale } from 'next/root-params'

export default async function Page({ params }) {
  await cookies()
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
