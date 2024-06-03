import { myMessage } from 'my-package'
import '@repo/internal-pkg'

export default function Page() {
  return <h1>{myMessage}</h1>
}
