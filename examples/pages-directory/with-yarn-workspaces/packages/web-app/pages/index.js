import foo from 'foo'
import Bar from 'bar'

export default function Home() {
  return (
    <div>
      Imported modules from another workspace:
      <pre>{foo}</pre>
      <Bar />
    </div>
  )
}
