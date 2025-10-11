export default function Page() {
  return (
    <>
      <p>{process.env.NEXT_PUBLIC_ENV_VAR}</p>
      <main suppressHydrationWarning>Timestamp</main>
    </>
  )
}
