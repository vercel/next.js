import { lang, locale } from 'next/root-params'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return (
    <p>
      <span id="param">
        {await lang()} {await locale()}
      </span>{' '}
      <span id="random">{data}</span>
    </p>
  )
}
