import { sharedHelper } from '../lib/shared'
import Counter from '../components/Counter'

export default function Page() {
  return (
    <p className="hello" data-len={sharedHelper()}>
      app-page
      <Counter />
    </p>
  )
}
