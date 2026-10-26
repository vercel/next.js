import { Counter } from '../components/counter'

export const runtime = 'edge'

export default function Page() {
  return (
    <main>
      <h1 id="page-edge">page edge</h1>
      <Counter label="home" />
    </main>
  )
}
