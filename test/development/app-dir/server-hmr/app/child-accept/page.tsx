import { message, evaluatedAt } from '../child-module'

export default function Page() {
  return (
    <div>
      <p id="message">{message}</p>
      <p id="eval-time">Module evaluated at: {evaluatedAt}</p>
    </div>
  )
}
