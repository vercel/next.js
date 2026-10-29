import data from './test.txt'
import stat from './input.stat'

export default function Page() {
  return (
    <div>
      <p id="test">{data}</p>
      <pre id="stat">{JSON.stringify(stat)}</pre>
    </div>
  )
}
