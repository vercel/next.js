import { evaluatedAt, hmrTrigger } from '../unmodified-module'

const pageLoadId = Math.random().toString(36).slice(2)

export default function Page() {
  return (
    <div>
      <p id="greeting">hello world</p>
      <p id="page-load-id">Page Load ID: {pageLoadId}</p>
      <p id="module-eval-time">Module Evaluated At: {evaluatedAt}</p>
      <p id="module-trigger">Module Trigger: {hmrTrigger}</p>
    </div>
  )
}
