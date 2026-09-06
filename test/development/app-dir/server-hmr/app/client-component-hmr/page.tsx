import { depEvalTime } from './dep'

const evaluatedAt = Date.now()

export default function Page() {
  return (
    <div>
      <p id="greeting">hello world</p>
      <p id="module-eval-time">Module Evaluated At: {evaluatedAt}</p>
      <p id="dep-eval-time">Dep Evaluated At: {depEvalTime}</p>
      <p id="client-component">not imported yet</p>
    </div>
  )
}
