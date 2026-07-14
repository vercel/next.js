import { ActionButtons } from './action-buttons'
import defaultAction, {
  delayedAction,
  errorAction,
  progressiveAction,
} from './actions'

export default function ActionsPage() {
  async function inlineAction() {
    'use server'
    return 'inline action complete'
  }

  return (
    <>
      <ActionButtons
        delayedAction={delayedAction}
        defaultAction={defaultAction}
        inlineAction={inlineAction}
        errorAction={errorAction}
      />
      <form action={progressiveAction}>
        <button id="progressive-action" type="submit">
          Progressive action
        </button>
      </form>
    </>
  )
}
