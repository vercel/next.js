export const instant = { level: 'experimental-error' }

export default function Page() {
  return (
    <main>
      <p>
        This page has instant validation but an unauthorized() signal in the
        parent layout bails before it renders.
      </p>
    </main>
  )
}
