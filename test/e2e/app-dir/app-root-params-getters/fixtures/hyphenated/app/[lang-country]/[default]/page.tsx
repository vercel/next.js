import * as rootParams from 'next/root-params'

export default async function Page() {
  return (
    <p>
      hello world{' '}
      {JSON.stringify({
        'lang-country': await rootParams['lang-country'](),
        default: await rootParams.default(),
      })}
    </p>
  )
}
