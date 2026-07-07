import { lang, locale } from 'next/root-params'

export default async function Page() {
  const result = await getCachedData()

  return (
    <p>
      <span id="param">
        {result.lang} {result.locale}
      </span>{' '}
      <span id="random">{result.random}</span>
    </p>
  )
}

async function getCachedData() {
  'use cache'

  const random = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return { lang: await lang(), locale: await locale(), random }
}
