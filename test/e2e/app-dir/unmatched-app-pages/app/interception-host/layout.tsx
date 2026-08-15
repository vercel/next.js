import type { ReactNode } from 'react'

/**
 * The interception matcher may retain every active host slot, so it remains
 * valid even though @secondary cannot match /intercepted/*. The ordinary
 * @canonical catch-all cannot retain slots and is therefore unreachable.
 */
export default function InterceptionHostLayout({
  canonical,
  modal,
  secondary,
}: {
  canonical: ReactNode
  modal: ReactNode
  secondary: ReactNode
}) {
  return (
    <>
      {canonical}
      {modal}
      {secondary}
    </>
  )
}
