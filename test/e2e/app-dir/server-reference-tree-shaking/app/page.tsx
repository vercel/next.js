import { lightweight as cacheLightweight } from '../lib/use-cache'
import { lightweight as serverLightweight } from '../lib/use-server'

export default function Page() {
  return (
    <>
      <p id="use-cache">{cacheLightweight()}</p>
      <p id="use-server">{serverLightweight()}</p>
    </>
  )
}
