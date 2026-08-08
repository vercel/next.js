import { action } from '../actions'
import { ActionButton } from '../button'

export default function Page() {
  return <ActionButton action={action} id="current-action" />
}
