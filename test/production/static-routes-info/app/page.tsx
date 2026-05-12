import './globals.css'
import { sharedHelper } from '../lib/shared'

export default function Page() {
  return (
    <p className="hello" data-len={sharedHelper()}>
      app-page
    </p>
  )
}
