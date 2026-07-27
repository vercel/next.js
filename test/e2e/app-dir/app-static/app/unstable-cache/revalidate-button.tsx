'use client'

export function RevalidateButton({ onClick }) {
  return (
    <form action={onClick}>
      <button type="submit">revalidate</button>
    </form>
  )
}
