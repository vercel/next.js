import { draftMode } from 'next/headers'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  const { isEnabled } = draftMode()

  return (
    <main>
      <pre id="draft-mode">{JSON.stringify({ isEnabled })}</pre>
      <p id="data">{data}</p>
    </main>
  )
}

export const generateStaticParams = async () => {
  const paths = [
    {
      route: [],
    },
    {
      route: ['test'],
    },
    {
      route: ['test-2'],
    },
  ]

  return paths
}
