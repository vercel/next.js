'use client'

import { revalidate } from './actions/revalidate'

export default function RevalidateViaForm({ tag }: { tag: string }) {
  const handleRevalidate = async () => {
    await revalidate(tag)
  }

  return (
    <form action={handleRevalidate}>
      <button type="submit" id="submit-form" className="underline">
        Revalidate via form
      </button>
    </form>
  )
}
