import { BrowserOnly } from './client'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <p>
        This page has suspense above body, which allows blocking the root. We're
        only blocking it with browser-only data, so this should be allowed
        regardless of <code>ensureStatic</code>.
      </p>
      <BrowserOnly />
    </main>
  )
}
