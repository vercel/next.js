import { depEvalTime } from './dep'

const pageLoadId = Math.random().toString(36).slice(2)
const evaluatedAt = Date.now()

export default function Page() {
  return (
    <div>
      <p id="greeting">hello world</p>
      <p id="page-load-id">Page Load ID: {pageLoadId}</p>
      <p id="module-eval-time">Module Evaluated At: {evaluatedAt}</p>
      <p id="dep-eval-time">Dep Evaluated At: {depEvalTime}</p>
      <p id="new-module-value">not imported yet</p>
    </div>
  )
}
