import ClientEntry from './client-entry'
import { Demo } from './demo'
import './page.css'

export default function Page() {
  return (
    <div className="analyze-page">
      Hello World <Demo />
      <ClientEntry />
    </div>
  )
}
