import { action } from './action'

export default function Page() {
  return (
    <button data-testid="log" onClick={action}>
      log
    </button>
  )
}
