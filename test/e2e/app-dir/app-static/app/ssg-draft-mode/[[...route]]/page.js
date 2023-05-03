import { draftMode } from 'next/headers'

export default function Page() {
  const { isEnabled } = draftMode()

  return (
    <main>
      <pre id="draft-mode">{JSON.stringify({ isEnabled })}</pre>
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
