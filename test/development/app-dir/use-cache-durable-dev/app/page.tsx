import { getCachedValue } from './cached'
import { Unrelated } from './unrelated'

export default async function Page() {
  return (
    <>
      <p id="cached">{await getCachedValue()}</p>
      <Unrelated />
    </>
  )
}
