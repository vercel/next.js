import { draftMode } from 'next/headers'

export default function Page() {
  const { enabled } = draftMode()

  return (
    <>
      <h1>hello from /hooks/use-draft-mode</h1>
      <p>Rand: {Math.random()}</p>
      <h2 id="draft-mode-val">{enabled ? 'ENABLED' : 'DISABLED'}</h2>
    </>
  )
}
