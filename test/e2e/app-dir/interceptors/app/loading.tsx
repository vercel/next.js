import { createTimeStamp } from './time-utils'

export default function RootLoading() {
  const timeStamp = createTimeStamp()
  console.log(timeStamp, 'RootLoading')
  return <p>Loading root {timeStamp} ...</p>
}
