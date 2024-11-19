export default function Page() {
  return (
    <p>
      {JSON.stringify([
        process.env.cjs,
        process.env.mjs,
        process.env.jsCJS,
        process.env.jsESM,
      ])}
    </p>
  )
}
