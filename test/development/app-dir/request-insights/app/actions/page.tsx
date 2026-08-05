import { CachedFunctionButton } from './cached-function-button'

export default function ActionsPage() {
  async function runAction() {
    'use server'
  }

  return (
    <>
      <form action={runAction}>
        <button id="run-server-action" type="submit">
          Run action
        </button>
      </form>
      <CachedFunctionButton />
    </>
  )
}
