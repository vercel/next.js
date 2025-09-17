export default function Page() {
  return (
    <p>
      {JSON.stringify([
        process.env.js,
        process.env.cjs,
        process.env.mjs,
        process.env.cts,
        process.env.mts,
        process.env.ts,
      ])}
    </p>
  )
}
