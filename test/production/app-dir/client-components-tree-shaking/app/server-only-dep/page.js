import { serverOnlyObject } from './server-only'

export default function Page() {
  console.log(serverOnlyObject)
  return <p>server only</p>
}
