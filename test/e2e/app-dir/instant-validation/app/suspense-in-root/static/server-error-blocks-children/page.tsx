export const instant = { level: 'experimental-error' }

export default function Page() {
  return (
    <main>
      <p>
        This page has instant validation but a server error in the parent layout
        blocks it from rendering.
      </p>
    </main>
  )
}
