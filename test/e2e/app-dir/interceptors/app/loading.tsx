import { createTimeStamp } from './time-utils'

export default function RootLoading() {
  const timeStamp = createTimeStamp()
  console.log(timeStamp, 'RootLoading')
  return <p suppressHydrationWarning>Loading root {timeStamp} ...</p>
}
