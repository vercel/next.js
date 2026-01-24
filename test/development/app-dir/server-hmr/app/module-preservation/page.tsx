import { evaluatedAt } from '../unmodified-module'

const pageLoadId = Math.random().toString(36).slice(2)

export default function Page() {
  return (
    <div>
      <p id="greeting">hello world</p>
      <p id="page-load-id">Page Load ID: {pageLoadId}</p>
      <p id="module-eval-time">Module Evaluated At: {evaluatedAt}</p>
    </div>
  )
}
