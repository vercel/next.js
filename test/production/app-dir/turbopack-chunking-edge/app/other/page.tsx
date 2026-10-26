import { Counter } from '../../components/counter'

export const runtime = 'edge'

export default function Page() {
  return (
    <main>
      <h1 id="page-other">page other</h1>
      <Counter label="other" />
    </main>
  )
}
