import { logWithTime } from '../../time-utils'
import { action } from './action'

export default async function SlotPage() {
  await logWithTime('SlotPage', () => Promise.resolve())

  return (
    <form action={action}>
      <button>Submit</button>
    </form>
  )
}
