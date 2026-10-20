'use client'

import { createValidationErrorDuringRender } from '../create-validation-error-during-render'

declare const EdgeRuntime: string

function ClientComponentValidationProbe() {
  // Client Components also render on the server for the initial HTML. Creating
  // the diagnostic here exercises the React instance used by SSR.
  const error = createValidationErrorDuringRender()
  return (
    <>
      <p id="ssr-runtime">
        {typeof EdgeRuntime === 'undefined' ? 'nodejs' : EdgeRuntime}
      </p>
      <pre id="ssr-stack">{error?.stack}</pre>
    </>
  )
}

export function ClientComponentOwner() {
  return <ClientComponentValidationProbe />
}
