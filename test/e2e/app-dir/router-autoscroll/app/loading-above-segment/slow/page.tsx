import { connection } from 'next/server'

export default async function Page() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return (
    <>
      <div id="slow-page">Slow page</div>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>{i}</div>
        ))
      }
      <div id="hash-target">Hash target</div>
      {Array.from({ length: 500 }, (_, i) => (
        <div key={i}>{i}</div>
      ))}
    </>
  )
}
