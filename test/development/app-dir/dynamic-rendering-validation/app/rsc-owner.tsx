import { createValidationErrorDuringRender } from '../create-validation-error-during-render'

declare const EdgeRuntime: string

function ServerComponentValidationProbe() {
  const error = createValidationErrorDuringRender()
  return (
    <>
      <p id="rsc-runtime">
        {typeof EdgeRuntime === 'undefined' ? 'nodejs' : EdgeRuntime}
      </p>
      <pre id="rsc-stack">{error?.stack}</pre>
    </>
  )
}

export function ServerComponentOwner() {
  return <ServerComponentValidationProbe />
}
