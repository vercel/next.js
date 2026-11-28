import { readCurrentTime } from 'external-time'

export default function Page() {
  return <p>{readCurrentTime()}</p>
}
