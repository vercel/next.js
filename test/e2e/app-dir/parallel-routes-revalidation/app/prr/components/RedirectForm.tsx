'use client'

export function RedirectForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button type="submit" className="button" id="redirect">
        Redirect to Home
      </button>
    </form>
  )
}
