import 'server-only'
import Counter from './counter'

export default async function Fixture({ label }: { label: string }) {
  const message = await Promise.resolve(`Hello ${label}`)
  return (
    <section>
      <h1>{message}</h1>
      <Counter />
    </section>
  )
}
