import Test from './test'
import { unstable_cache } from 'next/cache'

const getValue = unstable_cache(async () => Math.random(), [], {
  revalidate: 60,
})

export default async function Page() {
  return (
    <div>
      <div id="value1">{await getValue()}</div>
      <div id="value2">{await getValue()}</div>
      <Test />
    </div>
  )
}
