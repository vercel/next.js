'use client'

export default function Page() {
  return (
    <>
      <p>{process.env.NEXT_PUBLIC_CONFIG_ENV}</p>
      <main suppressHydrationWarning>Timestamp</main>
    </>
  )
}
