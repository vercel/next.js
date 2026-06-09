// Server component page that uses top-level await (TLA).
// Tests that TLA is properly transpiled for older browser targets.
import { data } from '../tla'

export default function TlaPage() {
  return <div>{data.message}</div>
}
