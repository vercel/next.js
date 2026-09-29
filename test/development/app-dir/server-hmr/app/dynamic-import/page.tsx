import { depEvalTime } from './dep'

const evaluatedAt = Date.now()

export default async function Page() {
  // Load a module in its own chunk via a server-side dynamic import(). The
  // chunk lives under server/chunks/ and is not part of the entry chunk's
  // synchronous chunk list, so its updates are surfaced through the async
  // loader module rather than the entry chunk list.
  const { lazyValue } = await import('./lazy')

  return (
    <div>
      <p id="greeting">hello world</p>
      <p id="module-eval-time">Module Evaluated At: {evaluatedAt}</p>
      <p id="dep-eval-time">Dep Evaluated At: {depEvalTime}</p>
      <p id="lazy-value">{lazyValue}</p>
      <p id="lazy-new-module-value">not imported yet</p>
    </div>
  )
}
