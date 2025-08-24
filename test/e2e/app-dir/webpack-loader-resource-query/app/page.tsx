// @ts-expect-error -- ignore
import { v } from './test.mdx?test=hi'

export default function Page() {
  console.log(v)
  return <p>hello world</p>
}
