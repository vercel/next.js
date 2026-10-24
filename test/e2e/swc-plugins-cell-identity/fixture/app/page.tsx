import { Part1 } from '../components/part-1'
import { Part2 } from '../components/part-2'
import { Part3 } from '../components/part-3'

export default function Page() {
  return (
    <main>
      <p>
        {PLUGIN_A} {PLUGIN_B} {PLUGIN_C}
      </p>
      <ul>
        <Part1 />
        <Part2 />
        <Part3 />
      </ul>
    </main>
  )
}
