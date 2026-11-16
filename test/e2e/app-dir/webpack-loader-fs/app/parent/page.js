import stat from './input.parent-stat'

export default function Page() {
  return <pre id="parent-stat">{JSON.stringify(stat)}</pre>
}
