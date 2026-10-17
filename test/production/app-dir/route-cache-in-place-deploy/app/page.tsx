import { build } from './build'
import { Counter } from './counter'

export default function Page() {
  return (
    <main>
      <p id="build">{build}</p>
      <Counter />
    </main>
  )
}
