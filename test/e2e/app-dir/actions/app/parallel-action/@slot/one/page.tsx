import { action } from '../../actions'
import { ActionButton } from '../../button'

export default function Page() {
  async function retainedAction() {
    'use server'
    return 'retained action invoked'
  }

  return (
    <>
      <ActionButton action={action} id="retained-shared-action" />
      <ActionButton action={retainedAction} id="retained-only-action" />
    </>
  )
}
