export default function Page() {
  return (
    <p>
      {JSON.stringify([
        process.env.cjs,
        process.env.mjs,
        process.env.cts,
        process.env.mts,
        process.env.ts,
        process.env.esm,
      ])}
    </p>
  )
}
