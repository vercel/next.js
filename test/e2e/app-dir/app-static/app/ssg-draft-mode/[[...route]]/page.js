import { draftMode } from 'next/headers'

export default function Page() {
  const result = draftMode()

  return (
    <main>
      <pre id="draft-mode">{JSON.stringify({ result })}</pre>
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
