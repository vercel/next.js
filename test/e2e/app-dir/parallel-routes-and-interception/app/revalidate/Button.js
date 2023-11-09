'use client'

export function Button({ revalidate, random }) {
  return (
    <>
      <form action={revalidate}>
        <button type="submit">revalidate</button>
      </form>
      <div>random: {random}</div>
    </>
  )
}
