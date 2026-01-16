// @ts-expect-error -- ignore
import { v } from './test.mdx?test=hi'
// @ts-expect-error -- ignore
import reversed from './data.txt?reverse'

export default function Page() {
  console.log(v)
  return (
    <div>
      <p>hello world</p>
      <p id="reversed">{reversed}</p>
    </div>
  )
}
