import { RefreshButton } from '../../../components/RefreshButton'
import { RevalidateButton } from '../../../components/RevalidateButton'

export default function Page() {
  return (
    <div>
      <div>Other Page</div>
      <div id="other-page-random">{Math.random()}</div>
      <RefreshButton />
      <RevalidateButton id="other" />
    </div>
  )
}
