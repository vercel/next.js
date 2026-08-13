import { action } from './actions'
import { ActionButton } from './button'

export default function Layout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <>
      <ActionButton action={action} id="shared-action" />
      {children}
      {slot}
    </>
  )
}
