// Expect: UNKNOWN (deopt) — "await is easy, it's `new Promise(...)` that is
// hard": a hand-constructed promise defeats static classification. The
// analyzer must say so honestly instead of guessing; only the runtime
// validator (which observes actual settling) can classify this.
export default async function Page() {
  const data = await new Promise<string>((resolve) => {
    setTimeout(() => resolve('late'), 50)
  })
  return <p>{data}</p>
}
