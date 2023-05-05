import { draftMode } from 'next/headers'

export default function Page() {
  const { isEnabled } = draftMode()

  return (
    <>
      <h1>hello from /hooks/use-draft-mode</h1>
      <p>
        Rand: <em id="rand">{Math.random()}</em>
      </p>
      <h2 id="draft-mode-val">{isEnabled ? 'ENABLED' : 'DISABLED'}</h2>
    </>
  )
}
