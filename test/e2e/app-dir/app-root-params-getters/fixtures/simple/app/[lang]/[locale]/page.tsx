import { lang, locale } from 'next/root-params'

export default async function Page() {
  return (
    <p>
      hello world{' '}
      {JSON.stringify({ lang: await lang(), locale: await locale() })}
    </p>
  )
}
