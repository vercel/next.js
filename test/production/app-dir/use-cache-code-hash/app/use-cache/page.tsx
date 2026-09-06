import { logic } from './logic'
import { unrelated } from './unrelated'

export default async function Page() {
  const value = await logic()
  return (
    <p>
      {value} {unrelated()}
    </p>
  )
}
