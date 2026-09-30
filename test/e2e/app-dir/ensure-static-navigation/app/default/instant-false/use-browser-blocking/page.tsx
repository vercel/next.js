import { BrowserOnly } from './client'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <p>
        This page has <code>instant = false</code> in a parent layout, which
        allows blocking the root. We're only blocking it with browser-only data,
        so this should be allowed regardless of <code>ensureStatic</code>.
      </p>
      <BrowserOnly />
    </main>
  )
}
