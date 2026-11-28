import { cookies, draftMode, headers } from 'next/headers'
import { getPromiseContext } from '../promise-context'

export const dynamic = 'force-static'

export default async function Page() {
  const controlContext = getPromiseContext(Promise.resolve())
  const cookiesContext = getPromiseContext(cookies())
  const headersContext = getPromiseContext(headers())
  const draftModeContext = getPromiseContext(draftMode())

  return (
    <main>
      <p id="control-captures-work-store">{String(controlContext.workStore)}</p>
      <p id="control-captures-work-unit-store">
        {String(controlContext.workUnitStore)}
      </p>
      <p id="cookies-captures-work-store">{String(cookiesContext.workStore)}</p>
      <p id="cookies-captures-work-unit-store">
        {String(cookiesContext.workUnitStore)}
      </p>
      <p id="headers-captures-work-store">{String(headersContext.workStore)}</p>
      <p id="headers-captures-work-unit-store">
        {String(headersContext.workUnitStore)}
      </p>
      <p id="draft-mode-captures-work-store">
        {String(draftModeContext.workStore)}
      </p>
      <p id="draft-mode-captures-work-unit-store">
        {String(draftModeContext.workUnitStore)}
      </p>
    </main>
  )
}
