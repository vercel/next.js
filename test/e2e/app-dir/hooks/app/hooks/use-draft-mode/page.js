import { draftMode } from 'next/headers'

export default function Page() {
  const { enabled } = draftMode()

  return (
    <>
      <h1>hello from /hooks/use-draft-mode</h1>
      {enabled ? (
        <h2 id="draft-mode-enabled">ENABLED</h2>
      ) : (
        <h2 id="draft-mode-disabled">DISABLED</h2>
      )}
    </>
  )
}
