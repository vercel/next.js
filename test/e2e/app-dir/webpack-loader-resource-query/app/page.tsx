// @ts-expect-error -- ignore
import { v } from './test.mdx?test=hi'
// @ts-expect-error -- ignore
import reversed from './data.txt?reverse'
// @ts-expect-error -- ignore
import upper from './data.txt?upper'

export default function Page() {
  console.log(v)
  return (
    <div>
      <p>hello world</p>
      <p id="reversed">{reversed}</p>
      <p id="upper">{upper}</p>
    </div>
  )
}
