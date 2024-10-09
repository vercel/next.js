import { createTimeStamp } from '../time-utils'

export default function NestedLoading() {
  const timeStamp = createTimeStamp()
  console.log(timeStamp, 'NestedLoading')
  return <p suppressHydrationWarning>Loading nested {timeStamp} ...</p>
}
