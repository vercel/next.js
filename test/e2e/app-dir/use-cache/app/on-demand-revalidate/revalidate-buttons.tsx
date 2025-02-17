'use client'

export function RevalidateButtons({
  revalidatePath,
}: {
  revalidatePath: () => Promise<void>
}) {
  return (
    <form>
      <button id="revalidate-path" formAction={revalidatePath}>
        revalidate with revalidatePath()
      </button>{' '}
      <button
        id="revalidate-api-route"
        formAction={async () => {
          await fetch('/api/revalidate?path=/on-demand-revalidate', {
            method: 'POST',
          })
        }}
      >
        revalidate with API route
      </button>
    </form>
  )
}
