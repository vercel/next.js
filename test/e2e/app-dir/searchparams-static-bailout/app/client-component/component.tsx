'use client'
export default function ClientComponent({ searchParams }) {
  return (
    <>
      <h1>Parameter: {searchParams.search}</h1>
    </>
  )
}
